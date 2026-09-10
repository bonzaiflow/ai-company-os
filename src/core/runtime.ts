import type { AgentAction, AiCompanyOsConfig, LLMProvider } from "../types.js";
import { resolveProvider } from "../llm/resolve.js";
import { AsyncMutex, nowIso, truncate } from "../util.js";
import { parseAction } from "./action-parse.js";
import { executeAgentAction, normalizeAgentAction } from "./agent-actions.js";
import { ACTION_SCHEMA, stepPrompt, systemPrompt } from "./prompts.js";
import {
  claimReadyWave,
  promoteWaitingParents,
  requeueStuckRunning,
} from "./queue.js";
import type { Company } from "./store.js";
import {
  failTask,
  MAX_STUCK_TICKS,
  retryOrFail,
  taskDepth,
} from "./task-lifecycle.js";
import type { TickOptions, TickResult } from "./tick-types.js";
import { toolsFor } from "./tools.js";

export { PRIORITY_RANK, raiseTaskPriority } from "./priority.js";
export { claimReadyWave, flushQueue, requeueStuckRunning } from "./queue.js";
export type { TickOptions, TickResult } from "./tick-types.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));


const storeLocks = new Map<string, AsyncMutex>();
function storeLockFor(co: Company): AsyncMutex {
  let m = storeLocks.get(co.dir);
  if (!m) {
    m = new AsyncMutex();
    storeLocks.set(co.dir, m);
  }
  return m;
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

    normalizeAgentAction(action, tools);

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

    const outcome = await executeAgentAction(
      {
        co,
        task,
        agent,
        meta,
        tools,
        reports,
        depth,
        maxDepth,
        step,
        transcript,
        gate,
        log,
        shouldStop: opts.shouldStop,
        taskId: id!,
      },
      action
    );
    if (outcome.kind === "return") return outcome.result;
    if (outcome.toolOkDelta) toolOk += outcome.toolOkDelta;
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
