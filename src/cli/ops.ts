import type { Command } from "commander";
import path from "node:path";
import { writeJson } from "../util.js";
import fs from "node:fs";
import { ownerRelease, ownerReport, WORK_EXIT, WorkError } from "../core/lease.js";
import { flushQueue, raiseTaskPriority } from "../core/runtime.js";
import { Company } from "../core/store.js";
import { usageReport } from "../core/usage.js";
import { c } from "../util.js";
import {
  companyOption,
  fail,
  openCompany,
  out,
  withJson,
  type CliCtx,
} from "./helpers.js";

export function registerOpsCommands(program: Command, ctx: CliCtx): void {
  withJson(
    companyOption(
      program
        .command("budget")
        .description("show or grant company token budget, set a monthly cap, show cost per agent")
        .option("--add <tokens>", "grant additional tokens")
        .option("--monthly <tokens>", "token cap per calendar month (UTC); 0 removes it")
        .action((opts) => {
          const co = openCompany(ctx, opts.company);
          const add = opts.add !== undefined ? Math.max(0, Number(opts.add) || 0) : 0;
          if (opts.add !== undefined && !add) fail("add must be a positive number");
          const meta = co.meta;
          if (add) {
            meta.budget.tokens += add;
            co.audit({ type: "budget.granted", ok: true, detail: `+${add.toLocaleString()} tokens (cli)` });
          }
          if (opts.monthly !== undefined) {
            const monthly = Math.max(0, Number(opts.monthly) || 0);
            meta.budget.monthlyTokens = monthly || undefined;
            co.audit({ type: "budget.monthly", ok: true, detail: monthly ? `${monthly.toLocaleString()} tokens/month (cli)` : "monthly cap removed (cli)" });
          }
          if (add || opts.monthly !== undefined) writeJson(path.join(co.dir, "company.json"), meta);
          const u = usageReport(co);
          out(
            {
              ok: true,
              budgetTokens: u.budgetTokens,
              spentTokens: u.tokens,
              remaining: Math.max(0, u.budgetTokens - u.tokens),
              month: u.month,
              monthTokens: u.tokensMonth,
              monthlyTokens: u.monthlyTokens,
              added: add || undefined,
              agents: u.agents,
            },
            () => {
              console.log(
                c.bold(co.meta.slug) +
                  `  budget ${u.tokens.toLocaleString()}/${u.budgetTokens.toLocaleString()}` +
                  (add ? c.green(`  (+${add.toLocaleString()})`) : "") +
                  `  ·  ${u.month}: ${u.tokensMonth.toLocaleString()}` +
                  (u.monthlyTokens ? `/${u.monthlyTokens.toLocaleString()}` : "")
              );
              for (const a of u.agents) {
                const who = a.runtime === "internal" ? "" : c.dim(` [${a.runtime}${a.adapter ? `/${a.adapter}` : ""}]`);
                const mins = a.minutes ? `  ${a.minutesMonth.toFixed(0)}/${a.minutes.toFixed(0)} min` : "";
                console.log(
                  `  ${a.name.padEnd(16)}${who}  ${a.tokensMonth.toLocaleString()} this month · ${a.tokens.toLocaleString()} total${mins}  ` +
                    c.dim(`${a.tasksDone} done, ${a.tasksFailed} failed`)
                );
              }
            }
          );
        })
    )
  );

  withJson(
    companyOption(
      program
        .command("delete")
        .description("delete a company folder permanently")
        .option("-y, --yes", "skip confirmation")
        .action((opts) => {
          const co = openCompany(ctx, opts.company);
          const slug = co.meta.slug;
          if (!opts.yes && !wantConfirm()) {
            fail("refusing to delete without --yes");
          }
          Company.delete(ctx.root, slug);
          out({ ok: true, deleted: slug }, () => console.log(c.yellow(`deleted ${slug}`)));
        })
    )
  );

  withJson(
    companyOption(
      program
        .command("flush")
        .description("clear queued/waiting tasks (mark failed); leave running alone")
        .action((opts) => {
          const co = openCompany(ctx, opts.company);
          const result = flushQueue(co);
          out(
            {
              ok: true,
              flushed: result.flushed.length,
              ids: result.flushed,
              leftRunning: result.leftRunning.length,
              running: result.leftRunning,
            },
            () => {
              console.log(
                c.yellow(`flushed ${result.flushed.length} task(s)`) +
                  (result.leftRunning.length
                    ? c.dim(` · ${result.leftRunning.length} still running`)
                    : "")
              );
            }
          );
        })
    )
  );

  withJson(
    companyOption(
      program
        .command("priority")
        .description("raise a task (and blockers) to the front of the queue")
        .argument("<id>", "task id")
        .option("--force", "force even if not queued")
        .action((id: string, opts) => {
          const co = openCompany(ctx, opts.company);
          const result = raiseTaskPriority(co, id, { force: !!opts.force });
          if (!result.ok) fail(result.error || "priority failed");
          out(
            {
              ok: true,
              id,
              priority: result.priority,
              chain: result.chain,
              moved: result.moved,
              forced: result.forced,
            },
            () => {
              console.log(
                c.green(`${id} → priority ${result.priority}`) +
                  c.dim(`  chain=${(result.chain || []).join(",")}`)
              );
            }
          );
        })
    )
  );
  // Owner side of the work contract — the CLI twin of the dashboard's
  // "Take back" / "Enter the result" for external and manual agents.
  const guard = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (e) {
      if (e instanceof WorkError) fail(e.message, WORK_EXIT[e.kind]);
      throw e;
    }
  };

  withJson(
    companyOption(
      program
        .command("take-back")
        .description("take a task back from the external/manual agent holding it (re-queued, no attempt counted)")
        .argument("<taskId>")
        .action((taskId: string, opts) => {
          const co = openCompany(ctx, opts.company);
          const holder = co.loadTask(taskId).lease?.holder;
          const t = guard(() => ownerRelease(co, taskId));
          out({ ok: true, taskId, status: t.status, from: holder }, () =>
            console.log(c.green(`${taskId} taken back from ${holder} — queued again`))
          );
        })
    )
  );

  withJson(
    companyOption(
      program
        .command("report")
        .description("enter the result for an external/manual agent's task, e.g. an answer pasted from a chat")
        .argument("<taskId>")
        .option("--result <text>", "the result")
        .option("--result-file <path>", "read the result from a file ('-' = stdin)")
        .option("--failed", "record a failed attempt instead (the text is the reason)")
        .action((taskId: string, opts) => {
          const co = openCompany(ctx, opts.company);
          const result = opts.resultFile ? fs.readFileSync(opts.resultFile === "-" ? 0 : opts.resultFile, "utf8") : opts.result;
          if (!result?.trim()) fail("give --result or --result-file", WORK_EXIT.input);
          const t = guard(() => ownerReport(co, taskId, String(result).trim(), !!opts.failed));
          out({ ok: true, taskId, status: t.status, agent: t.assignee }, () =>
            console.log(
              t.status === "done"
                ? c.green(`${taskId} done (reported for ${t.assignee})`)
                : t.status === "failed"
                  ? c.red(`${taskId} failed`)
                  : c.yellow(`${taskId} ${t.status} (attempt ${t.attempts ?? 0})`)
            )
          );
        })
    )
  );
}

function wantConfirm(): boolean {
  // non-interactive by default for MCP — require --yes
  return false;
}
