import type { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { listApprovals } from "../core/governance.js";
import { listCheckins } from "../core/checkin.js";
import { publicState } from "../core/connectors/index.js";
import { loadConfig } from "../config.js";
import { effectiveAgentLlm } from "../llm/resolve.js";
import { c } from "../util.js";
import {
  companyOption,
  fail,
  openCompany,
  out,
  withJson,
  type CliCtx,
} from "./helpers.js";
import { companyState, listInbox, safeCompanyPath, taskDetail } from "./inspect.js";

export function registerShowCommands(program: Command, ctx: CliCtx): void {
  const show = program.command("show").description("inspect company state (MCP-friendly reads)");

  withJson(
    companyOption(
      show
        .command("state")
        .description("full company snapshot (meta, agents, tasks, queue, audit, chat)")
        .action((opts) => {
          const co = openCompany(ctx, opts.company);
          const data = {
            ...companyState(co),
            pendingApprovals: listApprovals(co, "pending"),
            checkins: listCheckins(co).slice(-10),
            connectors: co.meta.connectors ?? {},
            connectorsState: publicState(co),
          };
          out(data, () => {
            console.log(c.bold(`${co.meta.name}`) + c.dim(` (${co.meta.slug})`));
            console.log(c.dim(co.meta.goal));
            console.log(
              `agents=${data.agents.length} tasks=${data.tasks.length} queue=${data.queue.length} pendingApprovals=${data.pendingApprovals.length}`
            );
            console.log(c.dim("use --json for the full snapshot"));
          });
        })
    )
  );

  withJson(
    companyOption(
      show
        .command("meta")
        .description("company.json settings (budget, schedule, policies, connectors…)")
        .action((opts) => {
          const co = openCompany(ctx, opts.company);
          out({ meta: co.meta, spent: co.spent() }, () => {
            console.log(JSON.stringify({ meta: co.meta, spent: co.spent() }, null, 2));
          });
        })
    )
  );

  withJson(
    companyOption(
      show
        .command("org")
        .description("organization chart / agent profiles (with effective LLM sources)")
        .action((opts) => {
          const co = openCompany(ctx, opts.company);
          const cfg = loadConfig(ctx.root);
          const agents = co.listAgents().map((a) => ({
            ...a,
            llm: effectiveAgentLlm(cfg, co.meta, a),
          }));
          out({ agents }, () => {
            for (const a of agents) {
              const llm =
                `${a.llm.provider}${a.llm.model ? "/" + a.llm.model : ""}` +
                (a.llm.source === "agent" ? "" : c.dim(`:${a.llm.source}`));
              console.log(
                `${a.rank.padEnd(8)} ${c.bold(a.name.padEnd(18))} ${c.cyan(llm.padEnd(28))} mgr=${(a.manager ?? "—").padEnd(16)} tools=${a.tools.join(",") || "—"}`
              );
            }
          });
        })
    )
  );

  withJson(
    companyOption(
      show
        .command("task")
        .description("one task with thoughts, children, and related audit")
        .argument("<id>", "task id (e.g. TASK-0003)")
        .action((id: string, opts) => {
          const co = openCompany(ctx, opts.company);
          try {
            const detail = taskDetail(co, id);
            out(detail, () => {
              const t = detail.task;
              console.log(c.bold(`${t.id} ${t.title}`) + c.dim(`  [${t.status}] → ${t.assignee}`));
              console.log(t.description);
              if (t.result) console.log(c.green("\n## Result\n") + t.result);
              if (detail.thoughts) console.log(c.dim("\n--- thoughts ---\n") + detail.thoughts.slice(0, 4000));
            });
          } catch (e) {
            fail((e as Error).message);
          }
        })
    )
  );

  withJson(
    companyOption(
      show
        .command("inbox")
        .description("list messages in an agent's INBOX (or OUTBOX / read)")
        .argument("<agent>", "agent name")
        .option("--box <box>", "INBOX | OUTBOX | read", "INBOX")
        .action((agent: string, opts) => {
          const co = openCompany(ctx, opts.company);
          if (!co.listAgents().some((a) => a.name === agent)) fail(`no agent named ${agent}`);
          const box =
            opts.box === "OUTBOX" ? "OUTBOX" : opts.box === "read" ? "INBOX/read" : "INBOX";
          const messages = listInbox(co, agent, box as "INBOX" | "OUTBOX" | "INBOX/read");
          out({ agent, box, messages }, () => {
            if (!messages.length) {
              console.log(c.dim(`(empty ${box})`));
              return;
            }
            for (const m of messages) {
              console.log(c.cyan(m.file) + c.dim(`  from ${m.from ?? "?"} · ${m.subject ?? ""}`));
              console.log(m.content.slice(0, 500) + (m.content.length > 500 ? "…" : ""));
              console.log("");
            }
          });
        })
    )
  );

  withJson(
    companyOption(
      show
        .command("chat")
        .description("chief ↔ owner chat transcript")
        .option("--planning", "show pre-launch planning chat instead")
        .action((opts) => {
          const co = openCompany(ctx, opts.company);
          const history = opts.planning ? co.planningChatHistory() : co.chatHistory();
          out({ chat: history }, () => {
            for (const m of history) {
              console.log(c.bold(m.role) + ": " + m.content.slice(0, 2000));
              console.log("");
            }
          });
        })
    )
  );

  withJson(
    companyOption(
      show
        .command("file")
        .description("read a file inside the company directory")
        .argument("<path>", "relative path (e.g. data/notes.md or agents/Chief/profile.md)")
        .option("--max <n>", "max characters to print", "100000")
        .action((rel: string, opts) => {
          const co = openCompany(ctx, opts.company);
          try {
            const full = safeCompanyPath(co, rel);
            if (!fs.existsSync(full) || !fs.statSync(full).isFile()) fail(`no such file: ${rel}`);
            const raw = fs.readFileSync(full);
            const max = Math.max(1000, Number(opts.max) || 100_000);
            const text = raw.toString("utf8");
            const truncated = text.length > max;
            out(
              {
                path: rel,
                bytes: raw.length,
                truncated,
                content: truncated ? text.slice(0, max) : text,
              },
              () => {
                process.stdout.write((truncated ? text.slice(0, max) + "\n… [truncated]\n" : text) + (text.endsWith("\n") ? "" : "\n"));
              }
            );
          } catch (e) {
            fail((e as Error).message);
          }
        })
    )
  );

  withJson(
    companyOption(
      show
        .command("files")
        .description("list files under a company subdirectory")
        .argument("[path]", "relative directory (default: .)", ".")
        .action((rel: string, opts) => {
          const co = openCompany(ctx, opts.company);
          try {
            const full = safeCompanyPath(co, rel || ".");
            if (!fs.existsSync(full)) fail(`no such path: ${rel}`);
            const st = fs.statSync(full);
            if (!st.isDirectory()) fail(`not a directory: ${rel}`);
            const entries = fs.readdirSync(full, { withFileTypes: true }).map((e) => {
              const p = path.join(full, e.name);
              const s = fs.statSync(p);
              return {
                name: e.name,
                path: path.relative(co.dir, p),
                type: e.isDirectory() ? "dir" : "file",
                bytes: e.isDirectory() ? undefined : s.size,
              };
            });
            out({ path: rel || ".", entries }, () => {
              for (const e of entries) {
                console.log(`${(e.type === "dir" ? e.name + "/" : e.name).padEnd(40)} ${e.bytes ?? ""}`);
              }
            });
          } catch (e) {
            fail((e as Error).message);
          }
        })
    )
  );

  withJson(
    companyOption(
      show
        .command("write")
        .description("write a text file inside the company directory (profiles, notes, company.json…)")
        .argument("<path>", "relative path to write")
        .option("--file <path>", "read content from a local file")
        .option("--content <text>", "inline content")
        .option("--mkdir", "create parent directories")
        .action((rel: string, opts) => {
          const co = openCompany(ctx, opts.company);
          let content = "";
          if (opts.file) {
            const src = path.resolve(String(opts.file));
            if (!fs.existsSync(src)) fail(`file not found: ${src}`);
            content = fs.readFileSync(src, "utf8");
          } else if (opts.content !== undefined) {
            content = String(opts.content);
          } else {
            fail("provide --file or --content");
          }
          try {
            const full = safeCompanyPath(co, rel);
            if (opts.mkdir) fs.mkdirSync(path.dirname(full), { recursive: true });
            else if (!fs.existsSync(path.dirname(full))) {
              fail(`parent directory missing (pass --mkdir): ${path.dirname(rel)}`);
            }
            fs.writeFileSync(full, content);
            out(
              { ok: true, path: rel, bytes: Buffer.byteLength(content) },
              () => console.log(c.green(`wrote ${rel} (${Buffer.byteLength(content)} B)`))
            );
          } catch (e) {
            fail((e as Error).message);
          }
        })
    )
  );

  withJson(
    companyOption(
      show
        .command("meta-set")
        .description("merge a JSON patch into company.json (policies, roles, budget, connectors…)")
        .argument("<json>", "inline JSON object or path to a JSON file")
        .action((jsonArg: string, opts) => {
          const co = openCompany(ctx, opts.company);
          let patch: Record<string, unknown>;
          try {
            if (jsonArg.trim().startsWith("{")) patch = JSON.parse(jsonArg);
            else {
              const p = path.resolve(jsonArg);
              patch = JSON.parse(fs.readFileSync(p, "utf8"));
            }
          } catch (e) {
            fail(`invalid JSON: ${(e as Error).message}`);
          }
          const meta = co.saveMeta(patch as Parameters<typeof co.saveMeta>[0]);
          out({ ok: true, meta }, () => console.log(c.green(`updated company.json for ${co.meta.slug}`)));
        })
    )
  );
}
