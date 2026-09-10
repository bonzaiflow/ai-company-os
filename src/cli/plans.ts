import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import type { ChatMessage, Plan } from "../types.js";
import { c, readJson, slugify } from "../util.js";
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
}
