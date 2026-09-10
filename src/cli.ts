#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { initWorkspace, loadConfig, resolveUiWorkspaceRoot, setPersistedWorkspaceRoot } from "./config.js";
import { createProvider } from "./llm/index.js";
import { listCheckins, runCheckin } from "./core/checkin.js";
import { exportCompanyZip, type CompanyExportMode } from "./core/export.js";
import { decideApproval, listApprovals } from "./core/governance.js";
import { runDaemon } from "./core/scheduler.js";
import { runLoop, tickWave } from "./core/runtime.js";
import { Company, scaffoldCompany } from "./core/store.js";
import { skillNames, skillSearchDirs } from "./core/skills.js";
import { normalizePlan, planInteractive, planOnce, renderPlan, savePlan } from "./planner.js";
import { serveUi } from "./ui/server.js";
import type { AgentSpec, ChatMessage, Plan } from "./types.js";
import { c, readJson, slugify, writeJson } from "./util.js";
import {
  fail,
  openCompany as openCompanyCtx,
  out,
  setJsonMode,
  type CliCtx,
} from "./cli/helpers.js";
import { registerShowCommands } from "./cli/show.js";
import { registerDbCommands } from "./cli/db.js";
import { registerOpsCommands } from "./cli/ops.js";
import { companyState, listAgentFiles } from "./cli/inspect.js";

const ROOT = process.cwd();
const BUNDLED_SKILLS = path.resolve(fileURLToPath(import.meta.url), "../../skills");
const DEFAULT_RETRY_HEADROOM = 2;
const CTX: CliCtx = { root: ROOT, bundledSkills: BUNDLED_SKILLS, json: false };

function availableSkills(): string[] {
  return skillNames(ROOT, BUNDLED_SKILLS);
}

function openCompany(slug?: string): Company {
  return openCompanyCtx(CTX, slug);
}

function orgTree(co: Company): string {
  const agents = co.listAgents();
  const lines: string[] = [];
  const render = (a: AgentSpec, indent: string) => {
    const badge =
      a.rank === "chief" ? c.yellow("CHIEF") : a.rank === "manager" ? c.magenta("MGR") : c.blue("WKR");
    lines.push(
      `${indent}${badge} ${c.bold(a.name)} ${c.dim(`(${a.role})`)} ${c.dim(`tools: ${a.tools.join(",") || "—"}`)}`
    );
    for (const r of agents.filter((x) => x.manager === a.name)) render(r, indent + "   ");
  };
  const roots = agents.filter((a) => !a.manager);
  for (const r of roots) render(r, "");
  return lines.join("\n");
}

const program = new Command();
program
  .name("ai-company-os")
  .description("agent-swarm orchestrator for small local models — full CLI for humans and MCP agents")
  .version("0.1.0")
  .option("--json", "machine-readable JSON on stdout (for MCP / automation)")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts() as { json?: boolean };
    if (opts.json) {
      setJsonMode(true);
      CTX.json = true;
    }
  });

registerShowCommands(program, CTX);
registerDbCommands(program, CTX);
registerOpsCommands(program, CTX);
program
  .command("init")
  .description("create ai-company-os.json + companies/ + plans/ in the current directory")
  .action(() => {
    const file = initWorkspace(ROOT);
    console.log(c.green(`workspace ready — edit providers in ${file}`));
  });

program
  .command("plan")
  .description("plan a company with an LLM (interactive chat, or --auto for one shot)")
  .argument("[goal...]", "what you want to accomplish")
  .option("-p, --provider <name>", "provider from ai-company-os.json")
  .option("-m, --model <model>", "model override")
  .option("--auto", "no chat: produce a plan in one shot and save it")
  .option("--launch", "with --auto: launch the company immediately")
  .action(async (goalWords: string[], opts) => {
    const cfg = loadConfig(ROOT);
    const provider = createProvider(cfg, opts.provider || cfg.roles?.planning, opts.model);
    const goal = goalWords.join(" ");
    const skills = availableSkills();

    if (opts.auto) {
      if (!goal) return program.error("--auto needs a goal argument");
      console.log(c.dim(`planning with ${provider.name}/${provider.model}…`));
      const plan = await planOnce(provider, goal, skills);
      console.log("\n" + renderPlan(plan) + "\n");
      const file = savePlan(ROOT, plan);
      console.log(c.green(`saved → ${file}`));
      if (opts.launch) launchPlan(plan, opts.provider, opts.model, file);
      else console.log(c.dim(`launch with: ai-company-os launch ${file}`));
      return;
    }

    const out = await planInteractive(provider, ROOT, skills, goal || undefined);
    if (!out) return;
    const file = savePlan(ROOT, out.plan);
    console.log(c.green(`plan saved → ${file}`));
    if (out.launch) launchPlan(out.plan, opts.provider, opts.model, file);
  });

function planChatPath(planFile: string, plan: Plan): string {
  const resolved = path.resolve(planFile);
  const dir = path.dirname(resolved);
  const base = path.basename(resolved);
  // plans/<slug>/plan.json → sibling chat.json; legacy plans/<slug>.json → <slug>.chat.json
  if (base === "plan.json") return path.join(dir, "chat.json");
  if (base.endsWith(".json")) return path.join(dir, base.replace(/\.json$/, ".chat.json"));
  return path.join(ROOT, "plans", slugify(plan.name), "chat.json");
}

function launchPlan(plan: Plan, provider?: string, model?: string, planFile?: string): void {
  const cfg = loadConfig(ROOT);
  const slug = slugify(plan.name);
  const chatFile = planFile
    ? planChatPath(planFile, plan)
    : path.join(ROOT, "plans", slug, "chat.json");
  const planningHistory = readJson<ChatMessage[]>(chatFile, []);
  const co = scaffoldCompany(
    ROOT,
    normalizePlan(plan),
    skillSearchDirs(ROOT, BUNDLED_SKILLS),
    provider ?? cfg.defaultProvider,
    model
  );
  if (Array.isArray(planningHistory) && planningHistory.length) {
    co.savePlanningChat(planningHistory);
  }
  // remove draft plan folder / legacy flat files after launch (same as UI)
  fs.rmSync(path.join(ROOT, "plans", slug), { recursive: true, force: true });
  fs.rmSync(path.join(ROOT, "plans", `${slug}.json`), { force: true });
  fs.rmSync(path.join(ROOT, "plans", `${slug}.chat.json`), { force: true });
  console.log(c.green(`launched company "${co.meta.name}" → ${co.dir}`));
  console.log(c.dim(`run it:  ai-company-os run -c ${co.meta.slug}`));
}

program
  .command("launch")
  .description("launch a company from a saved plan file")
  .argument("<planFile>")
  .option("-p, --provider <name>", "default provider for this company")
  .option("-m, --model <model>", "default model for this company")
  .action((planFile: string, opts) => {
    const plan = readJson<Plan | null>(path.resolve(planFile), null);
    if (!plan) return program.error(`cannot read plan file ${planFile}`);
    launchPlan(plan, opts.provider, opts.model, planFile);
  });

program
  .command("companies")
  .description("list companies in this workspace")
  .option("--json", "JSON output")
  .action((opts) => {
    if (opts.json) setJsonMode(true);
    const list = Company.list(ROOT).map((slug) => {
      const co = Company.open(ROOT, slug);
      const tasks = co.listTasks();
      const open = tasks.filter((t) => !["done", "failed"].includes(t.status));
      return {
        slug,
        name: co.meta.name,
        goal: co.meta.goal,
        paused: !!co.meta.paused,
        agents: co.listAgents().length,
        agentRanks: co.listAgents().map((a) => a.rank),
        tasksTotal: tasks.length,
        tasksOpen: open.length,
        tasksDone: tasks.filter((t) => t.status === "done").length,
        tasksFailed: tasks.filter((t) => t.status === "failed").length,
        running: tasks.some((t) => t.status === "running"),
        queue: co.queue().length,
        spentTokens: co.spent().tokens,
        budgetTokens: co.meta.budget.tokens,
      };
    });
    out({ companies: list }, () => {
      for (const co of list) {
        console.log(
          `${c.bold(co.slug.padEnd(28))} agents:${co.agents}  tasks:${co.tasksTotal} (${co.tasksOpen} open)  queue:${co.queue}`
        );
      }
    });
  });

program
  .command("status")
  .description("org chart, queue and budget of a company")
  .option("-c, --company <slug>")
  .option("--json", "JSON output")
  .action((opts) => {
    if (opts.json) setJsonMode(true);
    const co = openCompany(opts.company);
    const meta = co.meta;
    const spent = co.spent();
    const tasks = co.listTasks();
    const q = co.queue();
    const byStatus = (s: string) => tasks.filter((t) => t.status === s).length;
    const payload = {
      ...companyState(co),
      pendingApprovals: listApprovals(co, "pending").length,
      summary: {
        tasksTotal: tasks.length,
        done: byStatus("done"),
        waiting: byStatus("waiting"),
        failed: byStatus("failed"),
        running: byStatus("running"),
        queued: byStatus("queued"),
        queueLength: q.length,
      },
    };
    out(payload, () => {
      console.log(c.bold(`\n${meta.name}`) + c.dim(`  (${meta.slug})`));
      console.log(c.dim(meta.goal) + "\n");
      console.log(orgTree(co) + "\n");
      console.log(c.bold(`Queue (${q.length}):`));
      for (const id of q.slice(0, 10)) {
        const t = co.loadTask(id);
        console.log(`  ${c.cyan(id)} ${t.title} ${c.dim(`→ ${t.assignee}`)}`);
      }
      console.log(
        c.dim(
          `\nTasks: ${tasks.length} total · ${byStatus("done")} done · ${byStatus("waiting")} waiting · ${byStatus("failed")} failed`
        )
      );
      console.log(
        c.dim(`Budget: ${spent.tokens.toLocaleString()}/${meta.budget.tokens.toLocaleString()} tokens`)
      );
    });
  });

program
  .command("task")
  .description("enqueue a new root task for the chief")
  .argument("<title...>")
  .option("-c, --company <slug>")
  .option("-d, --desc <description>")
  .option("--recur <hours>", "also re-create this task every N hours (perpetual)")
  .action((titleWords: string[], opts) => {
    const co = openCompany(opts.company);
    const chief = co.chief();
    if (!chief) return program.error("company has no chief");
    const title = titleWords.join(" ");
    const t = co.createTask({
      title,
      description: opts.desc ?? title,
      assignee: chief.name,
      createdBy: "user",
    });
    co.enqueue(t.id);
    console.log(c.green(`${t.id} queued for ${chief.name}`));
    if (opts.recur) {
      const file = path.join(co.dir, "recurring.json");
      const templates = readJson<import("./types.js").RecurringTask[]>(file, []);
      templates.push({
        title,
        description: opts.desc ?? title,
        everyHours: Number(opts.recur),
        lastCreatedAt: new Date().toISOString(),
      });
      writeJson(file, templates);
      console.log(c.dim(`recurring every ${opts.recur}h — keep \`ai-company-os daemon\` running`));
    }
  });

program
  .command("tick")
  .description("process one parallel wave of ready tasks (distinct assignees)")
  .option("-c, --company <slug>")
  .option("--steps <n>", "max agent steps per task", "20")
  .action(async (opts) => {
    const co = openCompany(opts.company);
    const results = await tickWave(co, loadConfig(ROOT), {
      maxSteps: Number(opts.steps),
      log: (l) => console.log(l),
    });
    for (const r of results) {
      console.log(c.dim(`tick: ${r.status}${r.detail ? ` (${r.detail})` : ""}${r.taskId ? ` ${r.taskId}` : ""}`));
    }
  });

program
  .command("run")
  .description("run ticks until the queue is empty or budget/tick caps hit")
  .option("-c, --company <slug>")
  .option("-t, --ticks <n>", "max ticks", "50")
  .option("--steps <n>", "max agent steps per task", "20")
  .action(async (opts) => {
    const co = openCompany(opts.company);
    const out = await runLoop(co, loadConfig(ROOT), {
      maxTicks: Number(opts.ticks),
      maxSteps: Number(opts.steps),
      log: (l) => console.log(l),
    });
    console.log(c.bold(`\nstopped after ${out.ticks} tick(s): ${out.stopped}`));
  });

program
  .command("queue")
  .description("list all tasks")
  .option("-c, --company <slug>")
  .option("--json", "JSON output")
  .action((opts) => {
    if (opts.json) setJsonMode(true);
    const co = openCompany(opts.company);
    const tasks = co.listTasks();
    out({ tasks, queue: co.queue() }, () => {
      for (const t of tasks) {
        const color =
          t.status === "done"
            ? c.green
            : t.status === "failed"
              ? c.red
              : t.status === "waiting"
                ? c.yellow
                : c.cyan;
        console.log(
          `${c.bold(t.id)} ${color(t.status.padEnd(8))} ${c.dim((t.parent ?? "root").padEnd(9))} ${t.assignee.padEnd(16)} ${t.title}`
        );
      }
    });
  });

program
  .command("log")
  .description("tail the audit log")
  .option("-c, --company <slug>")
  .option("-n <lines>", "number of events", "30")
  .option("--json", "JSON output")
  .action((opts) => {
    if (opts.json) setJsonMode(true);
    const co = openCompany(opts.company);
    const events = co.auditTail(Number(opts.n));
    out({ events }, () => {
      for (const e of events) {
        const flag = e.ok ? c.green("OK") : c.red("ERR");
        console.log(
          `${c.dim(e.ts)} ${flag} ${c.bold(e.type.padEnd(18))} ${c.cyan(e.taskId ?? "")} ${c.dim(e.agent ?? "")} ${e.detail ?? ""}`
        );
      }
    });
  });

program
  .command("agent")
  .description("show an agent's profile and recent thoughts")
  .argument("<name>")
  .option("-c, --company <slug>")
  .option("--json", "JSON output")
  .action((name: string, opts) => {
    if (opts.json) setJsonMode(true);
    const co = openCompany(opts.company);
    const dir = co.agentDir(name);
    const profilePath = path.join(dir, "profile.md");
    if (!fs.existsSync(profilePath)) return fail(`no agent named ${name}`);
    const profile = fs.readFileSync(profilePath, "utf8");
    const ws = path.join(dir, "workspace");
    const workspace = fs.existsSync(ws)
      ? fs.readdirSync(ws).map((f) => ({ file: f, path: path.join("agents", name, "workspace", f) }))
      : [];
    const agent = co.loadAgent(name);
    out(
      { agent, profile, files: listAgentFiles(co, name), workspace },
      () => {
        console.log(profile);
        if (workspace.length) {
          console.log(c.bold("Workspace files:"));
          for (const f of workspace) console.log("  " + f.path);
        }
      }
    );
  });

program
  .command("doctor")
  .description("self-test all tools and provider reachability")
  .action(async () => {
    const { runDoctor, formatDoctor } = await import("./core/doctor.js");
    const checks = await runDoctor(loadConfig(ROOT));
    console.log(formatDoctor(checks));
    const fails = checks.filter((c) => c.level === "fail");
    if (fails.length) {
      console.error(c.red(`\n${fails.length} hard failure(s) — agents WILL hit these`));
      process.exit(1);
    }
    const warns = checks.filter((c) => c.level === "warn");
    console.log(
      warns.length
        ? c.yellow(`\n${warns.length} warning(s) — degraded but not fatal`)
        : c.green("\nall checks passed")
    );
  });

program
  .command("retry")
  .description("re-queue a failed task (or all failed tasks) for another attempt")
  .argument("[taskId]")
  .option("-c, --company <slug>")
  .option("--all-failed", "retry every failed task")
  .action((taskId: string | undefined, opts) => {
    const co = openCompany(opts.company);
    const targets = opts.allFailed
      ? co.listTasks().filter((t) => t.status === "failed")
      : taskId
        ? [co.loadTask(taskId)]
        : [];
    if (!targets.length) return program.error("give a task id or --all-failed");
    for (const t of targets) {
      t.status = "queued";
      t.maxAttempts = (t.attempts ?? 0) + DEFAULT_RETRY_HEADROOM; // fresh runway
      co.saveTask(t);
      co.enqueue(t.id);
      co.audit({ type: "task.retried", ok: true, taskId: t.id, detail: "by owner" });
      console.log(c.green(`${t.id} re-queued (attempt ${(t.attempts ?? 0) + 1})`));
    }
  });

program
  .command("daemon")
  .description("perpetual mode: wake every company on its schedule, forever")
  .option("--interval <seconds>", "poll interval", "60")
  .action(async (opts) => {
    await runDaemon(ROOT, () => loadConfig(ROOT), {
      intervalSec: Number(opts.interval),
      log: (l) => console.log(l),
    });
  });

program
  .command("pause")
  .description("pause a company (no ticks until resumed)")
  .option("-c, --company <slug>")
  .action((opts) => {
    const co = openCompany(opts.company);
    co.saveMeta({ paused: true });
    co.audit({ type: "company.paused", ok: true, detail: "by owner" });
    console.log(c.yellow(`${co.meta.slug} paused`));
  });

program
  .command("resume")
  .description("resume a paused company")
  .option("-c, --company <slug>")
  .action((opts) => {
    const co = openCompany(opts.company);
    co.saveMeta({ paused: false });
    co.audit({ type: "company.resumed", ok: true, detail: "by owner" });
    console.log(c.green(`${co.meta.slug} resumed`));
  });

program
  .command("schedule")
  .description("set the perpetual wake cadence for a company")
  .option("-c, --company <slug>")
  .option("--every <minutes>", "wake every N minutes", "30")
  .option("--ticks <n>", "max ticks per wake", "5")
  .option("--off", "disable the schedule")
  .action((opts) => {
    const co = openCompany(opts.company);
    const schedule = {
      everyMinutes: Number(opts.every),
      maxTicks: Number(opts.ticks),
      active: !opts.off,
    };
    co.saveMeta({ schedule });
    console.log(
      opts.off
        ? c.yellow("schedule disabled")
        : c.green(`wakes every ${schedule.everyMinutes}m, up to ${schedule.maxTicks} ticks — run: ai-company-os daemon`)
    );
  });

program
  .command("approvals")
  .description("list pending approval requests")
  .option("-c, --company <slug>")
  .action((opts) => {
    const co = openCompany(opts.company);
    const pending = listApprovals(co, "pending");
    if (!pending.length) return console.log(c.dim("no pending approvals"));
    for (const a of pending) {
      console.log(
        `${c.bold(a.id)} ${c.cyan(a.taskId)} ${a.agent} wants ${c.yellow(a.tool)} ${c.dim(JSON.stringify(a.args).slice(0, 100))}`
      );
    }
    console.log(c.dim(`\napprove: ai-company-os approve <id> · deny: ai-company-os deny <id> [-n note]`));
  });

program
  .command("approve")
  .argument("<id>")
  .option("-c, --company <slug>")
  .option("-n, --note <note>")
  .description("approve a pending request (re-queues the task)")
  .action((id: string, opts) => {
    const co = openCompany(opts.company);
    decideApproval(co, id, true, opts.note);
    console.log(c.green(`${id} approved — task re-queued`));
  });

program
  .command("deny")
  .argument("<id>")
  .option("-c, --company <slug>")
  .option("-n, --note <note>")
  .description("deny a pending request (agent is told to work around it)")
  .action((id: string, opts) => {
    const co = openCompany(opts.company);
    decideApproval(co, id, false, opts.note);
    console.log(c.yellow(`${id} denied — task re-queued with refusal`));
  });

program
  .command("checkin")
  .description("capture a statistical company snapshot right now")
  .option("-c, --company <slug>")
  .action(async (opts) => {
    const co = openCompany(opts.company);
    const ci = await runCheckin(co, loadConfig(ROOT));
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
    if (ci.questions.length) console.log(c.yellow("\nQuestions:\n") + ci.questions.map((q) => `  • ${q}`).join("\n"));
    if (ci.needs.length) console.log(c.magenta("\nNeeds:\n") + ci.needs.map((n) => `  • ${n}`).join("\n"));
    console.log(c.dim(`\nsaved → ${ci.file}`));
  });

program
  .command("checkins")
  .description("list past check-ins")
  .option("-c, --company <slug>")
  .action((opts) => {
    const co = openCompany(opts.company);
    for (const ci of listCheckins(co)) {
      console.log(`${c.bold(ci.ts)}  ${ci.questions.length} question(s), ${ci.needs.length} need(s)  ${c.dim(ci.file)}`);
    }
  });

program
  .command("audit")
  .description("verify the tamper-evident audit chain")
  .argument("[action]", "verify", "verify")
  .option("-c, --company <slug>")
  .action((action: string, opts) => {
    const co = openCompany(opts.company);
    const bad = co.verifyAudit();
    if (!bad) console.log(c.green(`audit chain intact ✓ (${co.auditTail(1_000_000).length} events)`));
    else {
      console.log(c.red(`audit chain BROKEN at line ${bad.line}: ${bad.reason}`));
      process.exit(1);
    }
  });

program
  .command("export")
  .description("export a company as a shareable .zip (layout or full)")
  .argument("<slug>", "company slug")
  .option("--mode <mode>", "layout (plan+org+skills) or full (everything)", "layout")
  .option("-o, --out <path>", "output zip path (default: <slug>-<mode>.zip in cwd)")
  .action((slugArg, opts) => {
    const slug = slugify(String(slugArg));
    const modeRaw = String(opts.mode ?? "layout").toLowerCase();
    const mode: CompanyExportMode = modeRaw === "full" ? "full" : "layout";
    if (modeRaw !== "layout" && modeRaw !== "full") {
      console.error(c.red('mode must be "layout" or "full"'));
      process.exit(1);
    }
    const co = Company.open(ROOT, slug);
    const exported = exportCompanyZip(co, mode);
    try {
      const dest = path.resolve(String(opts.out || exported.filename));
      fs.copyFileSync(exported.zipPath, dest);
      const bytes = fs.statSync(dest).size;
      co.audit({ type: "company.exported", ok: true, detail: `${mode} → ${dest} (${bytes} B)` });
      console.log(c.green(`exported ${mode} → ${dest} (${bytes.toLocaleString()} bytes)`));
    } finally {
      exported.cleanup();
    }
  });

program
  .command("ui")
  .description("serve the read-only web dashboard")
  .option("--port <port>", "port", "4646")
  .option("--dev", "enable live reload (use with npm run dev:ui)")
  .option("--daemon", "also wake scheduled companies in this process (perpetual mode)")
  .option("--cwd", "use the current directory even if a last workspace is saved")
  .action((opts) => {
    const root = opts.cwd ? ROOT : resolveUiWorkspaceRoot(ROOT);
    setPersistedWorkspaceRoot(root);
    serveUi(root, Number(opts.port), BUNDLED_SKILLS, { dev: !!opts.dev, daemon: !!opts.daemon });
  });

program.parseAsync().catch((e) => {
  console.error(c.red(String(e?.message ?? e)));
  process.exit(1);
});
