import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import { loadConfig } from "../config.js";
import { createProvider } from "../llm/index.js";
import { skillNames, skillSearchDirs } from "../core/skills.js";
import { scaffoldCompany } from "../core/store.js";
import { normalizePlan, plannerSystem, planTurn } from "../planner.js";
import type { ChatMessage, Plan } from "../types.js";
import { c, readJson, slugify, writeJson } from "../util.js";
import { fail, out, withJson, type CliCtx } from "./helpers.js";

function planFile(root: string, slug: string): string {
  const foldered = path.join(root, "plans", slug, "plan.json");
  const legacy = path.join(root, "plans", `${slug}.json`);
  return !fs.existsSync(foldered) && fs.existsSync(legacy) ? legacy : foldered;
}

function planChatFile(root: string, slug: string): string {
  const foldered = path.join(root, "plans", slug, "chat.json");
  const legacy = path.join(root, "plans", `${slug}.chat.json`);
  return !fs.existsSync(foldered) && fs.existsSync(legacy) ? legacy : foldered;
}

function deletePlanFiles(root: string, slug: string): void {
  fs.rmSync(path.join(root, "plans", slug), { recursive: true, force: true });
  fs.rmSync(path.join(root, "plans", `${slug}.json`), { force: true });
  fs.rmSync(path.join(root, "plans", `${slug}.chat.json`), { force: true });
}

function listPlanSlugs(root: string): { slug: string; name: string; goal: string; agents: number }[] {
  const dir = path.join(root, "plans");
  const outList: { slug: string; name: string; goal: string; agents: number }[] = [];
  const seen = new Set<string>();
  if (!fs.existsSync(dir)) return outList;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    let slug: string | null = null;
    if (f.isDirectory() && fs.existsSync(path.join(dir, f.name, "plan.json"))) slug = f.name;
    else if (f.isFile() && f.name.endsWith(".json") && !f.name.endsWith(".chat.json")) {
      slug = f.name.replace(/\.json$/, "");
    }
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const plan = readJson<Plan | null>(planFile(root, slug), null);
    if (plan) {
      outList.push({
        slug,
        name: plan.name,
        goal: plan.goal,
        agents: plan.agents?.length ?? 0,
      });
    }
  }
  return outList;
}

export function registerPlansCommands(program: Command, ctx: CliCtx): void {
  const plans = program.command("plans").description("list / inspect / delete saved company plans");

  withJson(
    plans
      .command("list")
      .description("list draft plans in plans/")
      .action(() => {
        const list = listPlanSlugs(ctx.root);
        out({ plans: list }, () => {
          if (!list.length) {
            console.log(c.dim("no plans yet"));
            return;
          }
          for (const p of list) {
            console.log(`${c.bold(p.slug)}  ${p.name}  ${c.dim(`${p.agents} agents`)}`);
            console.log(`  ${c.dim(p.goal.slice(0, 100))}`);
          }
        });
      })
  );

  withJson(
    plans
      .command("show")
      .description("show a plan and its planning chat history")
      .argument("<slug>", "plan slug")
      .action((slugArg: string) => {
        const slug = slugify(slugArg);
        const plan = readJson<Plan | null>(planFile(ctx.root, slug), null);
        if (!plan) fail(`plan not found: ${slug}`);
        const history = readJson<ChatMessage[]>(planChatFile(ctx.root, slug), []);
        out({ slug, plan, history }, () => {
          console.log(JSON.stringify({ slug, plan, historyLength: history.length }, null, 2));
        });
      })
  );

  withJson(
    plans
      .command("delete")
      .description("delete a draft plan (and its chat/uploads)")
      .argument("<slug>", "plan slug")
      .option("-y, --yes", "skip confirmation")
      .action((slugArg: string, opts) => {
        const slug = slugify(slugArg);
        if (!opts.yes && !process.env.AI_COMPANY_OS_YES) {
          fail("refusing to delete without --yes (or AI_COMPANY_OS_YES=1)");
        }
        deletePlanFiles(ctx.root, slug);
        out({ ok: true, deleted: slug }, () => console.log(c.green(`deleted plan ${slug}`)));
      })
  );

  withJson(
    plans
      .command("chat")
      .description("one planning turn against a draft (creates slug if new)")
      .argument("<slug>", "plan slug")
      .argument("<message...>", "owner message")
      .option("-p, --provider <name>")
      .option("-m, --model <model>")
      .action(async (slugArg: string, words: string[], opts) => {
        const slug = slugify(slugArg);
        const message = words.join(" ").trim();
        if (!message) fail("message required");
        const cfg = loadConfig(ctx.root);
        const provider = createProvider(
          cfg,
          opts.provider || cfg.roles?.planning || undefined,
          opts.model || undefined
        );
        const history = readJson<ChatMessage[]>(planChatFile(ctx.root, slug), []);
        let uploadsNote = "";
        const upDir = path.join(ctx.root, "plans", slug, "uploads");
        if (fs.existsSync(upDir)) {
          const files = fs.readdirSync(upDir);
          if (files.length) {
            uploadsNote =
              `\n\nThe owner has ALREADY uploaded data files that will be available to the company at ` +
              `data/uploads/: ${files.join(", ")}. Plan around this: agents can import them with the ` +
              `importdata tool instead of re-discovering from scratch.`;
          }
        }
        const turn = await planTurn(provider, [
          { role: "system", content: plannerSystem(skillNames(ctx.root, ctx.bundledSkills)) + uploadsNote },
          ...history.slice(-16),
          { role: "user", content: message },
        ]);
        fs.rmSync(path.join(ctx.root, "plans", `${slug}.json`), { force: true });
        fs.rmSync(path.join(ctx.root, "plans", `${slug}.chat.json`), { force: true });
        writeJson(path.join(ctx.root, "plans", slug, "plan.json"), turn.plan);
        const nextHistory = [
          ...history,
          { role: "user" as const, content: message },
          { role: "assistant" as const, content: JSON.stringify(turn) },
        ];
        writeJson(path.join(ctx.root, "plans", slug, "chat.json"), nextHistory);
        out(
          { ok: true, slug, reply: turn.reply, plan: turn.plan },
          () => {
            console.log(c.bold("planner:"));
            console.log(turn.reply);
            console.log(c.dim(`saved → plans/${slug}/plan.json`));
          }
        );
      })
  );

  withJson(
    plans
      .command("upload")
      .description("copy a file into plans/<slug>/uploads/ (copied into company on launch)")
      .argument("<slug>", "plan slug")
      .argument("<file>", "local file path")
      .option("--as <name>", "destination filename")
      .action(async (slugArg: string, fileArg: string, opts) => {
        const slug = slugify(slugArg);
        const src = path.resolve(fileArg);
        if (!fs.existsSync(src) || !fs.statSync(src).isFile()) fail(`not a file: ${src}`);
        const name = String(opts.as || path.basename(src))
          .replace(/[^\w.\- ]+/g, "_")
          .slice(0, 120);
        const dir = path.join(ctx.root, "plans", slug, "uploads");
        fs.mkdirSync(dir, { recursive: true });
        const buf = fs.readFileSync(src);
        if (buf.length > 15_000_000) fail("file too large (15MB max)");
        fs.writeFileSync(path.join(dir, name), buf);
        let preview: { rows: number; withEmail: number } | null = null;
        let parseError: string | null = null;
        try {
          const { parseBusinessFile } = await import("../core/tools.js");
          const parsed = parseBusinessFile(buf.toString("utf8"), name);
          preview = { rows: parsed.length, withEmail: parsed.filter((b) => b.email).length };
        } catch (e) {
          parseError = e instanceof Error ? e.message : String(e);
        }
        out(
          { ok: true, slug, path: `uploads/${name}`, preview, parseError, bytes: buf.length },
          () => console.log(c.green(`uploaded → plans/${slug}/uploads/${name} (${buf.length} B)`))
        );
      })
  );

  withJson(
    plans
      .command("launch")
      .description("launch a company from a draft plan slug (copies uploads, deletes draft)")
      .argument("<slug>", "plan slug")
      .option("-p, --provider <name>")
      .option("-m, --model <model>")
      .action((slugArg: string, opts) => {
        const slug = slugify(slugArg);
        const plan = readJson<Plan | null>(planFile(ctx.root, slug), null);
        if (!plan) fail(`plan not found: ${slug}`);
        const cfg = loadConfig(ctx.root);
        const planningHistory = readJson<ChatMessage[]>(planChatFile(ctx.root, slug), []);
        const co = scaffoldCompany(
          ctx.root,
          normalizePlan(plan),
          skillSearchDirs(ctx.root, ctx.bundledSkills),
          opts.provider || cfg.roles?.agents || cfg.defaultProvider,
          opts.model || undefined
        );
        if (planningHistory.length) co.savePlanningChat(planningHistory);
        const planUploads = path.join(ctx.root, "plans", slug, "uploads");
        if (fs.existsSync(planUploads)) {
          const dest = path.join(co.dir, "data", "uploads");
          fs.mkdirSync(dest, { recursive: true });
          for (const f of fs.readdirSync(planUploads)) {
            fs.copyFileSync(path.join(planUploads, f), path.join(dest, f));
          }
          co.audit({
            type: "upload.received",
            ok: true,
            detail: `from plan: ${fs.readdirSync(planUploads).join(", ")}`,
          });
        }
        deletePlanFiles(ctx.root, slug);
        out(
          { ok: true, slug: co.meta.slug, name: co.meta.name, dir: co.dir },
          () => {
            console.log(c.green(`launched company "${co.meta.name}" → ${co.dir}`));
            console.log(c.dim(`run it:  ai-company-os run -c ${co.meta.slug}`));
          }
        );
      })
  );
}
