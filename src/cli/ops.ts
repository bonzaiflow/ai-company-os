import type { Command } from "commander";
import path from "node:path";
import { writeJson } from "../util.js";
import { flushQueue, raiseTaskPriority } from "../core/runtime.js";
import { Company } from "../core/store.js";
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
        .description("show or grant company token budget")
        .option("--add <tokens>", "grant additional tokens")
        .action((opts) => {
          const co = openCompany(ctx, opts.company);
          const add = opts.add !== undefined ? Math.max(0, Number(opts.add) || 0) : 0;
          if (opts.add !== undefined && !add) fail("add must be a positive number");
          if (add) {
            const meta = co.meta;
            meta.budget.tokens += add;
            writeJson(path.join(co.dir, "company.json"), meta);
            co.audit({ type: "budget.granted", ok: true, detail: `+${add.toLocaleString()} tokens (cli)` });
          }
          const spent = co.spent();
          const budgetTokens = co.meta.budget.tokens;
          out(
            {
              ok: true,
              budgetTokens,
              spentTokens: spent.tokens,
              remaining: Math.max(0, budgetTokens - spent.tokens),
              added: add || undefined,
            },
            () => {
              console.log(
                c.bold(co.meta.slug) +
                  `  budget ${spent.tokens.toLocaleString()}/${budgetTokens.toLocaleString()}` +
                  (add ? c.green(`  (+${add.toLocaleString()})`) : "")
              );
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
}

function wantConfirm(): boolean {
  // non-interactive by default for MCP — require --yes
  return false;
}
