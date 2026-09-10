import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import { loadConfig } from "../config.js";
import { listCheckins, runCheckin } from "../core/checkin.js";
import { decideApproval, listApprovals } from "../core/governance.js";
import { c } from "../util.js";
import {
  companyOption,
  openCompany,
  out,
  wantJson,
  withJson,
  type CliCtx,
} from "./helpers.js";

export function registerGovernanceCommands(program: Command, ctx: CliCtx): void {
  withJson(
    companyOption(
      program
        .command("approvals")
        .description("list pending approval requests")
        .action((opts) => {
          const co = openCompany(ctx, opts.company);
          const pending = listApprovals(co, "pending");
          out({ approvals: pending }, () => {
            if (!pending.length) return console.log(c.dim("no pending approvals"));
            for (const a of pending) {
              console.log(
                `${c.bold(a.id)} ${c.cyan(a.taskId)} ${a.agent} wants ${c.yellow(a.tool)} ${c.dim(JSON.stringify(a.args).slice(0, 100))}`
              );
            }
            console.log(
              c.dim(`\napprove: ai-company-os approve <id> · deny: ai-company-os deny <id> [-n note]`)
            );
          });
        })
    )
  );

  withJson(
    companyOption(
      program
        .command("approve")
        .argument("<id>")
        .option("-n, --note <note>")
        .description("approve a pending request (re-queues the task)")
        .action((id: string, opts) => {
          const co = openCompany(ctx, opts.company);
          decideApproval(co, id, true, opts.note);
          out({ ok: true, id, decision: "approved" }, () =>
            console.log(c.green(`${id} approved — task re-queued`))
          );
        })
    )
  );

  withJson(
    companyOption(
      program
        .command("deny")
        .argument("<id>")
        .option("-n, --note <note>")
        .description("deny a pending request (agent is told to work around it)")
        .action((id: string, opts) => {
          const co = openCompany(ctx, opts.company);
          decideApproval(co, id, false, opts.note);
          out({ ok: true, id, decision: "denied" }, () =>
            console.log(c.yellow(`${id} denied — task re-queued with refusal`))
          );
        })
    )
  );

  withJson(
    companyOption(
      program
        .command("checkin")
        .description("capture a statistical company snapshot right now")
        .action(async (opts) => {
          const co = openCompany(ctx, opts.company);
          const ci = await runCheckin(co, loadConfig(ctx.root));
          out({ checkin: ci }, () => {
            console.log(c.bold(`\nCheck-in ${ci.ts}\n`));
            if (ci.stats) {
              const s = ci.stats;
              console.log(
                `Budget ${s.budget.pctLeft}% left · ${s.budget.spent.toLocaleString()} spent · ${s.budget.toolCalls} tools`
              );
              console.log(
                `Tasks ${s.tasks.total}: ${s.tasks.done} done, ${s.tasks.running} running, ${s.tasks.waiting} waiting, ${s.tasks.queued} queued, ${s.tasks.failed} failed · queue ${s.queue}`
              );
              for (const db of s.databases) {
                for (const t of db.tables) console.log(`  ${db.file}/${t.name}: ${t.rows} rows`);
              }
              for (const u of s.uploads) console.log(`  upload ${u.name}: ${u.bytes} B`);
            } else if (ci.report) {
              console.log(ci.report);
            }
            if (ci.questions.length) {
              console.log(c.yellow("\nQuestions:\n") + ci.questions.map((q) => `  • ${q}`).join("\n"));
            }
            if (ci.needs.length) {
              console.log(c.magenta("\nNeeds:\n") + ci.needs.map((n) => `  • ${n}`).join("\n"));
            }
            console.log(c.dim(`\nsaved → ${ci.file}`));
          });
        })
    )
  );

  withJson(
    companyOption(
      program
        .command("checkins")
        .description("list past check-ins")
        .action((opts) => {
          const co = openCompany(ctx, opts.company);
          const list = listCheckins(co);
          out({ checkins: list }, () => {
            for (const ci of list) {
              console.log(
                `${c.bold(ci.ts)}  ${ci.questions.length} question(s), ${ci.needs.length} need(s)  ${c.dim(ci.file)}`
              );
            }
          });
        })
    )
  );

  withJson(
    companyOption(
      program
        .command("audit")
        .description("verify or export the tamper-evident audit chain")
        .argument("[action]", "verify | export", "verify")
        .option("-o, --out <path>", "with export: write audit.jsonl here (default: stdout)")
        .action((action: string, opts) => {
          const co = openCompany(ctx, opts.company);
          if (action === "export") {
            const file = path.join(co.dir, "audit.jsonl");
            const body = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.from("");
            if (opts.out) {
              const dest = path.resolve(String(opts.out));
              fs.writeFileSync(dest, body);
              out({ ok: true, path: dest, bytes: body.length }, () =>
                console.log(c.green(`wrote ${body.length} bytes → ${dest}`))
              );
            } else if (wantJson()) {
              const lines = body
                .toString("utf8")
                .split("\n")
                .filter((l) => l.trim())
                .map((l) => {
                  try {
                    return JSON.parse(l);
                  } catch {
                    return l;
                  }
                });
              out({ events: lines, bytes: body.length });
            } else {
              process.stdout.write(body);
              if (!body.length || !body.toString("utf8").endsWith("\n")) process.stdout.write("\n");
            }
            return;
          }
          const bad = co.verifyAudit();
          const events = co.auditTail(1_000_000).length;
          out(
            { intact: !bad, problem: bad, events },
            () => {
              if (!bad) console.log(c.green(`audit chain intact ✓ (${events} events)`));
              else {
                console.log(c.red(`audit chain BROKEN at line ${bad.line}: ${bad.reason}`));
                process.exit(1);
              }
            }
          );
        })
    )
  );

  withJson(
    companyOption(
      program
        .command("pause")
        .description("pause a company (no ticks until resumed)")
        .action((opts) => {
          const co = openCompany(ctx, opts.company);
          co.saveMeta({ paused: true });
          co.audit({ type: "company.paused", ok: true, detail: "by owner" });
          out({ ok: true, paused: true, slug: co.meta.slug }, () =>
            console.log(c.yellow(`${co.meta.slug} paused`))
          );
        })
    )
  );

  withJson(
    companyOption(
      program
        .command("resume")
        .description("resume a paused company")
        .action((opts) => {
          const co = openCompany(ctx, opts.company);
          co.saveMeta({ paused: false });
          co.audit({ type: "company.resumed", ok: true, detail: "by owner" });
          out({ ok: true, paused: false, slug: co.meta.slug }, () =>
            console.log(c.green(`${co.meta.slug} resumed`))
          );
        })
    )
  );

  withJson(
    companyOption(
      program
        .command("schedule")
        .description("set the perpetual wake cadence for a company")
        .option("--every <minutes>", "wake every N minutes", "30")
        .option("--ticks <n>", "max ticks per wake", "5")
        .option("--off", "disable the schedule")
        .action((opts) => {
          const co = openCompany(ctx, opts.company);
          const schedule = {
            everyMinutes: Number(opts.every),
            maxTicks: Number(opts.ticks),
            active: !opts.off,
          };
          co.saveMeta({ schedule });
          out({ ok: true, schedule }, () => {
            console.log(
              opts.off
                ? c.yellow("schedule disabled")
                : c.green(
                    `wakes every ${schedule.everyMinutes}m, up to ${schedule.maxTicks} ticks — run: ai-company-os daemon`
                  )
            );
          });
        })
    )
  );
}
