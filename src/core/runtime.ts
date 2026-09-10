import type { AgentAction, AiCompanyOsConfig, LLMProvider, Task } from "../types.js";
import { resolveLlm, resolveProvider } from "../llm/resolve.js";
import { AsyncMutex, extractJson, nowIso, truncate } from "../util.js";
import { consumeApproval, findDecision, requestApproval } from "./governance.js";
import { ACTION_SCHEMA, stepPrompt, systemPrompt } from "./prompts.js";
import {
  claimReadyWave,
  promoteWaitingParents,
  requeueStuckRunning,
} from "./queue.js";
import type { Company } from "./store.js";
import { resolveToolName, toolsFor, type Tool } from "./tools.js";

export { PRIORITY_RANK, raiseTaskPriority } from "./priority.js";
export { claimReadyWave, flushQueue, requeueStuckRunning } from "./queue.js";

export interface TickResult {
  status: "worked" | "idle" | "budget" | "provider" | "stopped";
  taskId?: string;
  detail?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DEFAULT_MAX_ATTEMPTS = 3;

const storeLocks = new Map<string, AsyncMutex>();
function storeLockFor(co: Company): AsyncMutex {
  let m = storeLocks.get(co.dir);
  if (!m) {
    m = new AsyncMutex();
    storeLocks.set(co.dir, m);
  }
  return m;
}

/** A genuine work failure: retry with context until the attempt budget is
 * spent, then fail terminally (report to manager, wake parent). */
function retryOrFail(co: Company, task: Task, agent: string, reason: string): "retried" | "failed" {
  const attempts = (task.attempts ?? 0) + 1;
  const max = task.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  task.attempts = attempts;
  if (attempts < max) {
    task.status = "queued";
    task.result = `FAILED (attempt ${attempts}/${max}): ${reason}`;
    co.saveTask(task);
    co.enqueue(task.id);
    co.audit({
      type: "task.retry",
      ok: true,
      taskId: task.id,
      agent,
      detail: `attempt ${attempts}/${max} failed: ${truncate(reason, 140)} — re-queued`,
    });
    co.appendThought(agent, task.id, `\n**attempt ${attempts} failed:** ${reason} — will retry`);
    return "retried";
  }
  failTask(co, task, agent, `${reason} (after ${attempts} attempts)`);
  return "failed";
}

export interface TickOptions {
  maxSteps?: number;
  /** live progress callback for the CLI */
  log?: (line: string) => void;
  /** max depth of the delegation tree (root = 0) */
  maxDepth?: number;
  /** cooperative stop — checked between STEPS so a stop lands within one step,
   * not one whole tick. The in-flight task is saved as a clean continuation. */
  shouldStop?: () => boolean;
  /** task already claimed+running (parallel wave); skip dequeue */
  claimedId?: string;
  /** serialize company file writes across parallel ticks */
  storeLock?: AsyncMutex;
  /** max tasks to claim per wave (distinct assignees) */
  maxParallel?: number;
}

/** Parse a model reply into an action. If it isn't valid JSON and an
 * "execution" role model is configured, ask that (typically small, fast)
 * model to convert the raw text into one valid action object. This is what
 * lets models without structured-output / native tool-calling support still
 * drive tools: anything that can write JSON-ish text gets repaired here. */
async function parseAction(
  co: Company,
  cfg: AiCompanyOsConfig,
  agent: string,
  taskId: string,
  raw: string,
  tools: Tool[]
): Promise<AgentAction> {
  try {
    return extractJson(raw) as AgentAction;
  } catch (err) {
    const fixerOpts = { role: "execution" as const, meta: co.meta };
    const r = resolveLlm(cfg, fixerOpts);
    // Only attempt repair when an execution role is configured (workspace or company)
    if (r.source !== "company_roles" && r.source !== "workspace_roles") throw err;
    const fixer = resolveProvider(cfg, fixerOpts);
    const res = await fixer.chat(
      [
        {
          role: "system",
          content:
            "You convert an AI agent's raw reply into EXACTLY ONE valid JSON action object. " +
            'Fields: "thought" (string), "action" (one of "tool"|"delegate"|"message"|"complete"), ' +
            'plus the matching optional fields: tool+args, subtasks[{title,description,assignee}], to+content, or result.\n' +
            (tools.length
              ? "The ONLY valid tools (use their exact names and arg keys):\n" +
                tools.map((t) => `- ${t.doc}`).join("\n") + "\n"
              : "") +
            "Copy concrete values (SQL, urls, paths, text) from the reply into args verbatim — do not drop them. " +
            "Preserve the agent's intent faithfully. Output only the JSON object.",
        },
        { role: "user", content: raw },
      ],
      { schema: ACTION_SCHEMA, temperature: 0 }
    );
    co.addSpent(res.promptTokens + res.completionTokens, 0);
    const action = extractJson(res.content) as AgentAction;
    co.audit({
      type: "llm.repair",
      ok: true,
      agent,
      taskId,
      detail: `${fixer.name}/${fixer.model} recovered malformed action`,
    });
    return action;
  }
}

function taskDepth(co: Company, task: Task): number {
  let depth = 0;
  let cur = task;
  while (cur.parent && depth < 10) {
    cur = co.loadTask(cur.parent);
    depth++;
  }
  return depth;
}

const MAX_CONTINUATIONS = 12;
const MAX_STUCK_TICKS = 3; // consecutive no-progress ticks before a task truly fails

/** Returns true if a target task was NOT yet met but is still making progress,
 * so it should be re-driven rather than marked done. This is what makes
 * "find 10000" actually reach 10000 — one tick can't, so we continue the same
 * task, seeded with the live count, until it hits the number or stalls. */
function continueTowardTarget(co: Company, task: Task, agent: string, result: string): boolean {
  if (!task.target) return false;
  const have = co.measure(task.target);
  const need = task.target.count;
  if (have >= need) return false; // met — let it complete normally

  const prev = task.lastCount ?? 0;
  const cont = (task.continuations ?? 0) + 1;
  const progressed = have > prev;
  task.lastCount = have;
  task.continuations = cont;

  // stop conditions: no progress this round (real ceiling), or too many rounds
  if (!progressed || cont > MAX_CONTINUATIONS) {
    co.audit({
      type: "target.stalled",
      ok: false,
      taskId: task.id,
      agent,
      detail: `${have}/${need} in ${task.target.table}`,
    });
    // stamp the shortfall onto the result so it survives normal completion
    task._partialNote =
      `PARTIAL: reached ${have}/${need} rows in ${task.target.table}` +
      (progressed ? ` (continuation cap ${MAX_CONTINUATIONS} hit)` : ` — no new rows last round, source likely exhausted`) +
      ".";
    return false; // give up → normal completion, but with the shortfall noted
  }

  task.status = "queued";
  task.result = `IN PROGRESS: ${have}/${need} rows in ${task.target.table} (round ${cont}).`;
  co.saveTask(task);
  if (!co.queue().includes(task.id)) co.enqueue(task.id);
  co.audit({
    type: "target.continue",
    ok: true,
    taskId: task.id,
    agent,
    detail: `${have}/${need} in ${task.target.table} — +${have - prev} this round, continuing`,
  });
  return true;
}

function completeTask(co: Company, task: Task, agent: string, result: string): void {
  // a numeric-target task isn't "done" just because the agent said so —
  // measure the real count and keep driving it while it grows
  if (continueTowardTarget(co, task, agent, result)) return;

  task.status = "done";
  task.result = task._partialNote ? `${task._partialNote}\n\n${result}` : result;
  co.saveTask(task);
  co.audit({ type: "task.completed", ok: true, taskId: task.id, agent });

  // report up: OUTBOX copy + INBOX delivery to the manager (or user log for chief)
  const spec = co.loadAgent(agent);
  const report = `Task ${task.id} "${task.title}" finished.\n\n${result}`;
  if (spec.manager) {
    co.sendMessage(agent, spec.manager, `done: ${task.title}`, report, task.id);
  }

  // when the last sibling finishes, wake the waiting parent for synthesis
  if (task.parent) {
    const parent = co.loadTask(task.parent);
    const siblings = co.children(task.parent);
    if (
      parent.status === "waiting" &&
      siblings.every((s) => s.status === "done" || s.status === "failed")
    ) {
      parent.status = "queued";
      co.saveTask(parent);
      co.enqueue(parent.id);
    }
  }
}

function failTask(co: Company, task: Task, agent: string, reason: string): void {
  task.status = "failed";
  task.result = `FAILED: ${reason}`;
  co.saveTask(task);
  co.audit({ type: "task.failed", ok: false, taskId: task.id, agent, detail: reason });
  const spec = co.loadAgent(agent);
  if (spec.manager) {
    co.sendMessage(agent, spec.manager, `failed: ${task.title}`, reason, task.id);
  }
  if (task.parent) {
    const parent = co.loadTask(task.parent);
    const siblings = co.children(task.parent);
    if (
      parent.status === "waiting" &&
      siblings.every((s) => s.status === "done" || s.status === "failed")
    ) {
      parent.status = "queued";
      co.saveTask(parent);
      co.enqueue(parent.id);
    }
  }
}

/** Run one scheduler tick: pop the next queued task and let its assignee work
 * it to a terminal decision (delegate / complete / step limit). */
export async function tick(
  co: Company,
  cfg: AiCompanyOsConfig,
  opts: TickOptions = {}
): Promise<TickResult> {
  const log = opts.log ?? (() => {});
  const maxSteps = opts.maxSteps ?? 20;
  const maxDepth = opts.maxDepth ?? 2;
  const lock = opts.storeLock;
  const gate = async <T>(fn: () => T | Promise<T>): Promise<T> =>
    lock ? lock.run(fn) : await Promise.resolve(fn());

  if (co.meta.paused) return { status: "idle", detail: "company is paused" };

  const over = co.budgetExceeded();
  if (over) {
    await gate(() => co.audit({ type: "budget.exceeded", ok: false, detail: over }));
    return { status: "budget", detail: over };
  }

  let id = opts.claimedId;
  if (!id) {
    // Prefer the ready-wave claimer so waiting parents parked in the queue
    // (under their blockers) are never started early.
    const wave = claimReadyWave(co, 1);
    if (wave.length) {
      id = wave[0];
    } else {
      promoteWaitingParents(co);
      requeueStuckRunning(co, 10);
      const again = claimReadyWave(co, 1);
      id = again[0];
    }
    if (!id) return { status: "idle" };
  } else {
    const claimed = co.loadTask(id);
    claimed.status = "running";
    co.saveTask(claimed);
  }

  const task = co.loadTask(id!);
  const agent = co.loadAgent(task.assignee);
  const meta = co.meta;

  // per-agent budget: an exhausted agent hands work back to its manager
  if (agent.budgetTokens) {
    const spentByAgent = co.spent().byAgent?.[agent.name] ?? 0;
    if (spentByAgent >= agent.budgetTokens) {
      await gate(() => {
        failTask(
          co,
          task,
          agent.name,
          `agent budget exhausted (${spentByAgent.toLocaleString()}/${agent.budgetTokens!.toLocaleString()} tokens) — owner can raise budgetTokens in the agent profile`
        );
        co.audit({ type: "budget.agent", ok: false, agent: agent.name, taskId: id });
      });
      return { status: "worked", taskId: id, detail: "agent budget exhausted" };
    }
  }
  let provider: LLMProvider;
  try {
    provider = resolveProvider(cfg, {
      role: "agents",
      meta,
      agent,
    });
  } catch (e) {
    // configuration problem (unknown provider, missing key) — not the task's
    // fault: keep it queued and surface the problem to the operator
    await gate(() => {
      task.status = "queued";
      co.saveTask(task);
      co.enqueueFront(task.id);
      co.audit({ type: "provider.unavailable", ok: false, taskId: id, detail: (e as Error).message });
    });
    return { status: "provider", taskId: id, detail: (e as Error).message };
  }

  const tools = toolsFor(agent.tools);
  const reports = co.directReports(agent.name);
  const system = systemPrompt(co, agent, tools);
  const inbox = await gate(() => co.readInbox(agent.name));
  const transcript: string[] = [];
  const depth = taskDepth(co, task);
  let lastActionKey = "";
  let repeatCount = 0;
  let llmOk = 0;
  let consecutiveLlmErrors = 0;
  let toolOk = 0; // successful tool calls this tick — the "did work happen" signal

  log(`▶ ${task.id} "${task.title}" → ${agent.name} [${provider.name}/${provider.model}]`);
  await gate(() =>
    co.appendThought(agent.name, task.id, `\n## Tick ${nowIso()} (${task.status} → running)`)
  );

  for (let step = 1; step <= maxSteps; step++) {
    // cooperative stop: land within one step, save the task as a clean
    // continuation (it resumes next run exactly where it paused)
    if (opts.shouldStop?.() && step > 1) {
      await gate(() => {
        task.status = "queued";
        task.continuations = (task.continuations ?? 0) + 1;
        task.noProgress = 0;
        task.result = `PAUSED by owner mid-work after ${toolOk} tool action(s) this tick — resumes on next run.`;
        co.saveTask(task);
        if (!co.queue().includes(task.id)) co.enqueueFront(task.id);
        co.audit({ type: "run.paused", ok: true, taskId: task.id, agent: agent.name, detail: `${toolOk} actions before pause` });
      });
      log(`  ⏸ ${task.id} paused by owner — saved to front of queue for resume`);
      return { status: "stopped", taskId: id, detail: "paused by owner" };
    }
    const user = stepPrompt(co, task, step === 1 ? inbox : [], transcript);
    let action: AgentAction;
    try {
      const res = await provider.chat(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { schema: ACTION_SCHEMA }
      );
      await gate(() => {
        co.addSpent(res.promptTokens + res.completionTokens, 0, agent.name);
        co.audit({
          type: "llm.call",
          ok: true,
          agent: agent.name,
          taskId: task.id,
          detail: `${provider.name}/${provider.model} ${res.promptTokens}+${res.completionTokens}tok`,
        });
      });
      llmOk++;
      consecutiveLlmErrors = 0;
      action = await parseAction(co, cfg, agent.name, task.id, res.content, tools);
    } catch (e) {
      const msg = (e as Error).message;
      await gate(() =>
        co.audit({ type: "llm.call", ok: false, agent: agent.name, taskId: task.id, detail: msg })
      );
      transcript.push(`step ${step}: ERROR contacting/parsing model: ${truncate(msg, 300)}`);
      log(`  ✗ step ${step}: ${truncate(msg, 120)}`);
      consecutiveLlmErrors++;
      // infrastructure outage, not a work failure: the provider is down or
      // unreachable. Put the task back where it was and stop — the loop /
      // daemon retries later instead of burning the step budget in seconds.
      if (consecutiveLlmErrors >= 3) {
        await gate(() => {
          task.status = "queued";
          co.saveTask(task);
          co.enqueueFront(task.id);
          co.audit({
            type: "provider.unavailable",
            ok: false,
            taskId: task.id,
            detail: `${provider.name}/${provider.model}: ${truncate(msg, 140)} — task resumed to front of queue`,
          });
        });
        log(`  ⚠ provider unavailable — ${task.id} back to front of queue`);
        return { status: "provider", taskId: id, detail: truncate(msg, 160) };
      }
      await sleep(Math.min(10_000, 2000 * consecutiveLlmErrors));
      continue;
    }

    await gate(() =>
      co.appendThought(
        agent.name,
        task.id,
        `### Step ${step}\n**thought:** ${action.thought ?? ""}\n**action:** ${action.action}`
      )
    );
    log(`  ${step}. ${action.action}${action.tool ? `:${action.tool}` : ""} — ${truncate(action.thought ?? "", 100)}`);

    // small models put right intent in wrong slots — normalize instead of failing:
    // {"action":"search"} → {"action":"tool","tool":"search"}; missing tool name
    // inferred from the args shape (query→search, sql→sqlite, url→fetch, …)
    if (!["tool", "delegate", "message", "complete"].includes(action.action)) {
      if (tools.some((t) => t.name === (action.action as string))) {
        action.tool = action.action as string;
        action.action = "tool";
      }
    }
    if (action.action === "tool" && action.tool) action.tool = resolveToolName(action.tool);
    if (action.action === "tool" && !tools.some((t) => t.name === action.tool)) {
      const a = action.args ?? {};
      const inferred = a.query ? "search" : a.sql || a.db ? "sqlite" : a.url ? "fetch" : a.op || a.path ? "filesystem" : null;
      if (inferred && tools.some((t) => t.name === inferred)) action.tool = inferred;
    }

    // small models loop: detect the exact same action re-issued and interrupt
    const actionKey = JSON.stringify([action.action, action.tool, action.args]);
    if (action.action === "tool" && actionKey === lastActionKey) {
      repeatCount++;
      if (repeatCount >= 2) {
        transcript.push(
          `step ${step}: BLOCKED: you have now issued the exact same tool call ${repeatCount + 1} times in a row — it will keep returning the same thing. Take a DIFFERENT step (different args or different tool), or complete with an honest result.`
        );
        continue;
      }
    } else {
      repeatCount = 0;
    }
    lastActionKey = actionKey;

    switch (action.action) {
      case "tool": {
        const tool = tools.find((t) => t.name === action.tool);
        let observation: string;
        let ok = true;
        if (!tool) {
          observation = `error: tool "${action.tool}" not available (you have: ${tools.map((t) => t.name).join(", ") || "none"})`;
          ok = false;
          await gate(() =>
            co.appendThought(agent.name, task.id, `**observation:** ${truncate(observation, 800)}`)
          );
        } else if (meta.policies?.approveTools?.includes(tool.name)) {
          // governance gate: this tool needs the owner's sign-off
          const decision = findDecision(co, task.id, tool.name);
          if (!decision) {
            await gate(() => {
              requestApproval(co, agent.name, task.id, tool.name, action.args ?? {});
              task.status = "waiting";
              co.saveTask(task);
              co.appendThought(agent.name, task.id, `**parked:** awaiting owner approval for ${tool.name}`);
            });
            log(`  ⏸ ${task.id} parked — ${tool.name} needs owner approval`);
            return { status: "worked", taskId: id, detail: `awaiting approval for ${tool.name}` };
          }
          if (decision.status === "pending") {
            await gate(() => {
              task.status = "waiting";
              co.saveTask(task);
            });
            log(`  ⏸ ${task.id} still awaiting owner approval (${decision.id})`);
            return { status: "worked", taskId: id, detail: `awaiting approval ${decision.id}` };
          }
          if (decision.status === "denied") {
            await gate(() => consumeApproval(co, decision));
            transcript.push(
              `step ${step}: owner DENIED use of ${tool.name}${decision.note ? ` ("${decision.note}")` : ""} — do not try it again; work around it or complete honestly.`
            );
            break;
          }
          await gate(() => consumeApproval(co, decision)); // approved: execute this once
          await gate(() => co.addSpent(0, 1));
          try {
            observation = await gate(() =>
              tool.run({ company: co, agent: agent.name, shouldStop: opts.shouldStop }, action.args ?? {})
            );
          } catch (e) {
            observation = `error: ${(e as Error).message}`;
            ok = false;
          }
          await gate(() => {
            co.audit({
              type: `tool.${tool.name}`,
              ok,
              agent: agent.name,
              taskId: task.id,
              detail: `[owner-approved ${decision.id}] ` + truncate(JSON.stringify(action.args ?? {}), 180),
            });
            co.appendThought(agent.name, task.id, `**observation:** ${truncate(observation, 800)}`);
          });
          transcript.push(
            `step ${step}: tool ${action.tool}(${JSON.stringify(action.args ?? {})}) [owner approved] → ${truncate(observation, 1600)}`
          );
          break;
        } else {
          await gate(() => co.addSpent(0, 1));
          try {
            observation = await gate(() =>
              tool.run({ company: co, agent: agent.name, shouldStop: opts.shouldStop }, action.args ?? {})
            );
          } catch (e) {
            observation = `error: ${(e as Error).message}`;
            ok = false;
          }
          if (ok) toolOk++;
          await gate(() => {
            co.audit({
              type: `tool.${tool.name}`,
              ok,
              agent: agent.name,
              taskId: task.id,
              detail: truncate(JSON.stringify(action.args ?? {}), 200),
            });
            co.appendThought(agent.name, task.id, `**observation:** ${truncate(observation, 800)}`);
          });
        }
        transcript.push(
          `step ${step}: tool ${action.tool}(${JSON.stringify(action.args ?? {})}) → ${truncate(observation, 1600)}`
        );
        break;
      }

      case "message": {
        if (action.to && co.listAgents().some((a) => a.name === action.to)) {
          await gate(() =>
            co.sendMessage(agent.name, action.to!, `note re ${task.id}`, action.content ?? "", task.id)
          );
          transcript.push(`step ${step}: sent message to ${action.to}`);
        } else {
          transcript.push(`step ${step}: error: unknown agent "${action.to}"`);
        }
        break;
      }

      case "delegate": {
        if (!reports.length) {
          transcript.push(`step ${step}: error: you have no reports; do the work yourself and complete`);
          break;
        }
        if (depth >= maxDepth) {
          transcript.push(
            `step ${step}: error: delegation depth limit reached; complete the task yourself`
          );
          break;
        }
        const subtasks = (action.subtasks ?? []).filter((s) => s.title && s.assignee);
        const valid = subtasks.filter((s) => reports.some((r) => r.name === s.assignee));
        if (!valid.length) {
          transcript.push(
            `step ${step}: error: no valid subtasks; assignees must be one of: ${reports.map((r) => r.name).join(", ")}`
          );
          break;
        }
        await gate(() => {
          for (const s of valid.slice(0, 6)) {
            const child = co.createTask({
              title: s.title,
              description: s.description || s.title,
              assignee: s.assignee,
              createdBy: agent.name,
              parent: task.id,
            });
            co.enqueue(child.id);
            co.sendMessage(
              agent.name,
              s.assignee,
              `new task ${child.id}: ${s.title}`,
              s.description || s.title,
              child.id
            );
          }
          task.status = "waiting";
          co.saveTask(task);
          co.appendThought(
            agent.name,
            task.id,
            `**delegated:** ${valid.map((s) => `${s.assignee}←"${s.title}"`).join("; ")}`
          );
        });
        log(`  ⇒ delegated ${valid.length} subtask(s), ${task.id} now waiting`);
        return { status: "worked", taskId: id, detail: `delegated ${valid.length}` };
      }

      case "complete": {
        await gate(() => {
          completeTask(co, task, agent.name, action.result ?? "(no result text)");
          co.appendThought(agent.name, task.id, `**completed:** ${truncate(action.result ?? "", 500)}`);
        });
        log(`  ✓ ${task.id} completed`);
        return { status: "worked", taskId: id, detail: "completed" };
      }

      default:
        transcript.push(`step ${step}: error: unknown action "${String(action.action)}"`);
    }
  }

  // Step limit is a PAUSE, not a failure. Most "failed" tasks were simply
  // mid-work — fetching 100 sites can't fit in one tick. If the agent made real
  // progress this tick (any successful tool call), continue it next tick. Only
  // give up after MAX_STUCK_TICKS consecutive ticks with zero successful actions.
  const stuck = toolOk > 0 ? 0 : (task.noProgress ?? 0) + 1;
  if (stuck < MAX_STUCK_TICKS) {
    await gate(() => {
      task.status = "queued";
      task.continuations = (task.continuations ?? 0) + 1;
      task.noProgress = stuck;
      task.result = `IN PROGRESS: hit the ${maxSteps}-step tick limit after ${toolOk} tool action(s) this tick — continuing (round ${task.continuations}).`;
      co.saveTask(task);
      if (!co.queue().includes(task.id)) co.enqueue(task.id);
      co.audit({
        type: "task.continue",
        ok: true,
        taskId: task.id,
        agent: agent.name,
        detail: `step limit; ${toolOk} tool ok this tick — continuing (round ${task.continuations})`,
      });
    });
    log(`  ↻ ${task.id} paused at step limit (${toolOk} action(s) done) — continuing`);
    return { status: "worked", taskId: id, detail: "continuing" };
  }

  await gate(() =>
    failTask(co, task, agent.name, `stuck: ${stuck} consecutive ticks with no successful tool action`)
  );
  log(`  ✗ ${task.id} failed: no progress across ${stuck} ticks`);
  return { status: "worked", taskId: id, detail: "stuck" };
}

/** Run a dependency-aware wave: claim ready tasks (distinct assignees) and
 * drive their LLM steps concurrently. Store/tool writes are serialized. */
export async function tickWave(
  co: Company,
  cfg: AiCompanyOsConfig,
  opts: TickOptions = {}
): Promise<TickResult[]> {
  if (co.meta.paused) return [{ status: "idle", detail: "company is paused" }];
  const over = co.budgetExceeded();
  if (over) {
    co.audit({ type: "budget.exceeded", ok: false, detail: over });
    return [{ status: "budget", detail: over }];
  }

  const lock = opts.storeLock ?? storeLockFor(co);
  const maxParallel = opts.maxParallel ?? 4;
  const wave = await lock.run(() => {
    if (!co.queue().length) {
      promoteWaitingParents(co);
      requeueStuckRunning(co, 10);
    }
    return claimReadyWave(co, maxParallel);
  });

  if (!wave.length) return [{ status: "idle" }];

  const log = opts.log ?? (() => {});
  if (wave.length > 1) log(`⇉ parallel ×${wave.length}: ${wave.join(", ")}`);

  return Promise.all(
    wave.map((claimedId) =>
      tick(co, cfg, { ...opts, claimedId, storeLock: lock, maxParallel })
    )
  );
}

/** Run ticks until the queue drains, the budget runs out, maxTicks, or
 * shouldStop() returns true (checked between ticks — a tick in flight
 * finishes first). */
export async function runLoop(
  co: Company,
  cfg: AiCompanyOsConfig,
  opts: TickOptions & {
    maxTicks?: number;
    shouldStop?: () => boolean;
    /** on drain, let the chief evaluate goal-delta and emit tasks (default on) */
    replan?: boolean;
    maxReplans?: number;
  } = {}
): Promise<{ ticks: number; stopped: string }> {
  const maxTicks = opts.maxTicks ?? 50;
  const replan = opts.replan ?? true;
  // HARD CONSTRAINT: keep replanning as long as the goal is unmet AND we're
  // still making real headway. Only a genuine stall (a whole replan cycle that
  // barely moved the numbers) counts as exhaustion. A high ceiling is just an
  // infinite-loop backstop, not the normal stopper.
  const maxReplans = opts.maxReplans ?? 200;
  const MIN_CYCLE_PROGRESS = 5; // rows a replan cycle must add or it's exhausted
  let replans = 0;
  let stalls = 0;
  for (let i = 0; i < maxTicks; i++) {
    if (opts.shouldStop?.()) return { ticks: i, stopped: "stopped by user" };
    const results = await tickWave(co, cfg, opts);
    const r =
      results.find((x) => x.status === "stopped") ||
      results.find((x) => x.status === "budget") ||
      results.find((x) => x.status === "provider") ||
      results.find((x) => x.status === "worked") ||
      results[0] ||
      ({ status: "idle" } as TickResult);
    if (r.status === "stopped") return { ticks: i, stopped: "stopped by user" };
    if (r.status === "budget") return { ticks: i, stopped: `budget: ${r.detail}` };
    if (r.status === "provider") {
      return { ticks: i, stopped: `provider unavailable (${r.detail}) — tasks kept, will resume` };
    }
    if (r.status === "idle") {
      // queue drained — the goal is the hard constraint: do not stop while a
      // numeric target is unmet and progress is still possible
      const unmet = (co.meta.targets ?? [])
        .map((t) => ({ t, have: co.measure(t) }))
        .filter((x) => x.have < x.t.count);

      if (replan && unmet.length && replans < maxReplans && !co.meta.paused && !co.budgetExceeded()) {
        const before = unmet.reduce((s, x) => s + x.have, 0);
        replans++;
        opts.log?.(
          `↻ goal unmet (${unmet.map((x) => `${x.t.label} ${x.have}/${x.t.count}`).join(", ")}) — chief replanning [cycle ${replans}]`
        );
        try {
          const { chiefReplan } = await import("./chat.js");
          const created = await chiefReplan(co, cfg);
          if (created.length) {
            opts.log?.(`  ⇒ replan created ${created.map((t) => t.id).join(", ")}`);
            continue; // keep working the new tasks
          }
        } catch (e) {
          opts.log?.(`  ✗ replan failed: ${(e as Error).message}`);
        }
        // replan produced nothing to run, OR the last cycle barely moved:
        // decide exhaustion by measured cross-cycle progress, not by chatter
        const after = unmet.reduce((s, x) => s + co.measure(x.t), 0);
        if (after - before < MIN_CYCLE_PROGRESS) {
          stalls++;
          if (stalls >= 2) {
            return {
              ticks: i,
              stopped: `goal not reachable — 2 replan cycles added <${MIN_CYCLE_PROGRESS} rows (best: ${unmet
                .map((x) => `${x.t.label} ${co.measure(x.t)}/${x.t.count}`)
                .join(", ")}). Sources appear exhausted; owner input needed.`,
            };
          }
        } else {
          stalls = 0;
        }
        continue;
      }
      return { ticks: i, stopped: r.detail ?? "queue empty" };
    }
  }
  return { ticks: maxTicks, stopped: `max ticks (${maxTicks}) — still working, run again to continue` };
}
