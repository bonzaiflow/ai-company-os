import fs from "node:fs";
import type { Command } from "commander";
import { renderBrief } from "../core/brief.js";
import {
  claimNext,
  delegateHeld,
  failHeld,
  finishTask,
  heartbeat,
  heldTask,
  releaseTask,
  WORK_EXIT,
  WorkError,
  workAgent,
} from "../core/lease.js";
import type { Company } from "../core/store.js";
import { messageAgent, type SubtaskSpec } from "../core/work.js";
import { c } from "../util.js";
import { companyOption, fail, openCompany, out, withJson, type CliCtx } from "./helpers.js";

/** `ai-company-os work …` — the agent-agnostic contract for external agents
 * (docs/AGENT-CONTRACT.md). Anything that can run a shell command — Claude
 * Code, Codex, Cursor, a script, a human — works tasks through these. */

function guard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof WorkError) fail(e.message, WORK_EXIT[e.kind]);
    throw e;
  }
}

function who(opts: { as?: string }): string {
  const name = opts.as || process.env.AI_COMPANY_OS_AGENT;
  if (!name) fail("say which agent you are: --as <Name> (or set AI_COMPANY_OS_AGENT)", WORK_EXIT.input);
  return name;
}

function taskSummary(t: { id: string; title: string; status: string; assignee: string; parent?: string; priority: string }) {
  return { id: t.id, title: t.title, status: t.status, assignee: t.assignee, parent: t.parent, priority: t.priority };
}

function readText(value?: string, file?: string): string | undefined {
  if (file) return fs.readFileSync(file, "utf8");
  return value;
}

function briefFor(co: Company, taskId: string, leaseId: string): string {
  const task = heldTask(co, taskId, leaseId);
  return renderBrief(co, task, co.loadAgent(task.assignee), task.lease!);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function registerWorkCommands(program: Command, ctx: CliCtx): void {
  const work = program
    .command("work")
    .description("external agents: claim tasks under a lease and report back (see docs/AGENT-CONTRACT.md)");

  withJson(
    companyOption(
      work
        .command("next")
        .description("claim your next ready task (or resume the one you hold) and print its brief")
        .option("--as <name>", "agent name (default $AI_COMPANY_OS_AGENT)")
        .option("--wait <seconds>", "wait up to N seconds for work to appear", "0")
        .action(async (opts) => {
          const co = openCompany(ctx, opts.company);
          const name = who(opts);
          guard(() => workAgent(co, name));
          const deadline = Date.now() + Number(opts.wait) * 1000;
          for (;;) {
            const claim = guard(() => claimNext(co, name));
            if (claim) {
              const brief = guard(() => briefFor(co, claim.task.id, claim.lease.id));
              return out(
                { ok: true, resumed: claim.resumed, task: taskSummary(claim.task), lease: claim.lease, brief },
                () => console.log(brief)
              );
            }
            if (Date.now() >= deadline) break;
            await sleep(2000);
          }
          out({ ok: true, idle: true, agent: name }, () => console.log(c.dim(`nothing to do for ${name}`)));
          process.exit(WORK_EXIT.idle);
        })
    )
  );

  withJson(
    companyOption(
      work
        .command("brief")
        .argument("<taskId>")
        .requiredOption("--lease <id>")
        .description("print the assignment for a task you hold")
        .action((taskId: string, opts) => {
          const co = openCompany(ctx, opts.company);
          const brief = guard(() => briefFor(co, taskId, opts.lease));
          out({ ok: true, taskId, brief }, () => console.log(brief));
        })
    )
  );

  withJson(
    companyOption(
      work
        .command("heartbeat")
        .argument("<taskId>")
        .requiredOption("--lease <id>")
        .description("extend your lease while you keep working")
        .action((taskId: string, opts) => {
          const co = openCompany(ctx, opts.company);
          const lease = guard(() => heartbeat(co, taskId, opts.lease));
          out({ ok: true, taskId, lease }, () => console.log(c.dim(`${taskId} held until ${lease.until}`)));
        })
    )
  );

  withJson(
    companyOption(
      work
        .command("done")
        .argument("<taskId>")
        .requiredOption("--lease <id>")
        .option("--result <text>", "result summary")
        .option("--result-file <path>", "read the result from a file")
        .option("--tokens <n>", "tokens you spent (counts against the budget)")
        .description("report the result (owner review first if the agent has approveResults)")
        .action((taskId: string, opts) => {
          const co = openCompany(ctx, opts.company);
          const result = readText(opts.result, opts.resultFile);
          if (!result?.trim()) fail("give --result or --result-file", WORK_EXIT.input);
          const o = guard(() => finishTask(co, taskId, opts.lease, result!, { tokens: opts.tokens ? Number(opts.tokens) : undefined }));
          const payload =
            o.status === "review"
              ? { ok: true, taskId, status: "review", approval: o.approval.id }
              : { ok: true, taskId, status: o.status };
          out(payload, () =>
            console.log(
              o.status === "review"
                ? c.yellow(`${taskId} waiting for owner review (${o.approval.id})`)
                : o.status === "done"
                  ? c.green(`${taskId} done`)
                  : c.yellow(`${taskId} back in the queue (target not reached yet)`)
            )
          );
        })
    )
  );

  withJson(
    companyOption(
      work
        .command("fail")
        .argument("<taskId>")
        .requiredOption("--lease <id>")
        .requiredOption("--reason <text>")
        .option("--no-retry", "fail for good instead of counting an attempt")
        .description("report that you could not do the task")
        .action((taskId: string, opts) => {
          const co = openCompany(ctx, opts.company);
          const task = guard(() => failHeld(co, taskId, opts.lease, opts.reason, opts.retry !== false));
          out({ ok: true, taskId, status: task.status }, () => console.log(c.yellow(`${taskId} → ${task.status}`)));
        })
    )
  );

  withJson(
    companyOption(
      work
        .command("delegate")
        .argument("<taskId>")
        .requiredOption("--lease <id>")
        .requiredOption("--subtasks <json>", "JSON array of {title, description, assignee}, or @file.json")
        .description("split your task into subtasks for your direct reports")
        .action((taskId: string, opts) => {
          const co = openCompany(ctx, opts.company);
          const raw = String(opts.subtasks).startsWith("@") ? fs.readFileSync(String(opts.subtasks).slice(1), "utf8") : String(opts.subtasks);
          let subtasks: SubtaskSpec[];
          try {
            subtasks = JSON.parse(raw);
            if (!Array.isArray(subtasks)) throw new Error("not an array");
          } catch (e) {
            return fail(`--subtasks must be a JSON array: ${(e as Error).message}`, WORK_EXIT.input);
          }
          const o = guard(() => delegateHeld(co, taskId, opts.lease, subtasks));
          const created = o.ok ? o.created.map(taskSummary) : [];
          out({ ok: true, taskId, status: "waiting", created }, () =>
            console.log(c.green(`${taskId} waiting on ${created.map((t) => `${t.id}→${t.assignee}`).join(", ")}`))
          );
        })
    )
  );

  withJson(
    companyOption(
      work
        .command("message")
        .requiredOption("--to <agent>")
        .requiredOption("--text <text>")
        .option("--as <name>", "agent name (default $AI_COMPANY_OS_AGENT)")
        .option("--task <taskId>", "task the note is about")
        .description("drop a note into another agent's inbox")
        .action((opts) => {
          const co = openCompany(ctx, opts.company);
          const from = who(opts);
          const sent = messageAgent(co, from, opts.to, opts.text, opts.task);
          if (!sent.ok) fail(sent.error, WORK_EXIT.input);
          out({ ok: true, from, to: opts.to }, () => console.log(c.green(`sent to ${opts.to}`)));
        })
    )
  );

  withJson(
    companyOption(
      work
        .command("release")
        .argument("<taskId>")
        .requiredOption("--lease <id>")
        .option("--reason <text>")
        .description("hand the task back unfinished (no attempt counted)")
        .action((taskId: string, opts) => {
          const co = openCompany(ctx, opts.company);
          guard(() => releaseTask(co, taskId, opts.lease, opts.reason));
          out({ ok: true, taskId, status: "queued" }, () => console.log(c.dim(`${taskId} released`)));
        })
    )
  );

  withJson(
    companyOption(
      work
        .command("inbox")
        .option("--as <name>", "agent name (default $AI_COMPANY_OS_AGENT)")
        .description("show your unread messages (does not mark them read)")
        .action((opts) => {
          const co = openCompany(ctx, opts.company);
          const name = who(opts);
          const messages = co.peekInbox(name);
          out({ ok: true, agent: name, messages }, () => {
            if (!messages.length) return console.log(c.dim("no unread messages"));
            for (const m of messages) console.log(`${c.bold(m.from)} — ${m.subject}\n${m.content}\n`);
          });
        })
    )
  );
}
