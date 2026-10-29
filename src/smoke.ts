/** End-to-end smoke test on the mock provider: chief delegates to two
 * workers, workers use sqlite/filesystem tools, chief synthesizes. No model
 * needed. Run with: npm run smoke */
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { ingestInbound, mainMenuKeyboard } from "./core/connectors/index.js";
import { renderBrief } from "./core/brief.js";
import { decideApproval } from "./core/governance.js";
import { claimNext, delegateHeld, finishTask, WorkError } from "./core/lease.js";
import { expireLeases } from "./core/queue.js";
import { runLoop } from "./core/runtime.js";
import { usageReport } from "./core/usage.js";
import { normalizePlan } from "./planner.js";
import { serveAgents } from "./mcp/remote.js";
import { scaffoldCompany } from "./core/store.js";
import { resolveToolName, toolsFor } from "./core/tools.js";
import type { Plan } from "./types.js";
import { writeJson } from "./util.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-company-os-smoke-"));
const bundledSkills = path.resolve(fileURLToPath(import.meta.url), "../../skills");

const responses = [
  // tick 1: Boss delegates
  JSON.stringify({
    thought: "split the work",
    action: "delegate",
    subtasks: [
      { title: "Create db", description: "Create a leads table in data/main.db with 2 rows", assignee: "Digger" },
      { title: "Write summary", description: "Write data/summary.md", assignee: "Writer" },
    ],
  }),
  // tick 2: Digger — create, insert, verify, complete
  JSON.stringify({ thought: "create table", action: "tool", tool: "sqlite", args: { db: "main.db", sql: "CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY, name TEXT)" } }),
  JSON.stringify({ thought: "insert rows", action: "tool", tool: "sqlite", args: { db: "main.db", sql: "INSERT INTO leads (name) VALUES ('Acme'), ('Globex')" } }),
  JSON.stringify({ thought: "verify", action: "tool", tool: "sqlite", args: { db: "main.db", sql: "SELECT COUNT(*) AS n FROM leads" } }),
  JSON.stringify({ thought: "done", action: "complete", result: "2 leads stored in data/main.db table leads" }),
  // tick 3: Writer — write file, complete
  JSON.stringify({ thought: "write summary", action: "tool", tool: "filesystem", args: { op: "write", path: "data/summary.md", content: "# Summary\nAll good." } }),
  JSON.stringify({ thought: "done", action: "complete", result: "wrote data/summary.md" }),
  // tick 4: Boss synthesizes
  JSON.stringify({ thought: "children done, roll up", action: "complete", result: "Done: db has 2 leads (data/main.db), summary at data/summary.md" }),
];

const script = path.join(root, "mock-script.json");
fs.writeFileSync(script, JSON.stringify(responses));
writeJson(path.join(root, "ai-company-os.json"), {
  defaultProvider: "mock",
  roles: { planning: "mock", agents: "mock", execution: "mock" },
  providers: { mock: { type: "mock", script } },
});

const plan: Plan = {
  name: "Smoke Test Inc",
  goal: "Prove the engine works end to end",
  approach: "Chief delegates to two workers, then synthesizes.",
  agents: [
    { name: "Boss", role: "CEO", rank: "chief", responsibilities: ["coordinate"], tools: [], skills: ["delegation", "reporting"] },
    { name: "Digger", role: "DB Worker", rank: "worker", manager: "Boss", responsibilities: ["db work"], tools: ["sqlite"], skills: ["data-entry"] },
    { name: "Writer", role: "Doc Worker", rank: "worker", manager: "Boss", responsibilities: ["write docs"], tools: ["filesystem"], skills: [] },
  ],
  budget: { tokens: 100_000 },
  rootTasks: [{ title: "Build the demo dataset", description: "Create db + summary" }],
};

const co = scaffoldCompany(root, plan, [bundledSkills], "mock");
const cfg = loadConfig(root);
const out = await runLoop(co, cfg, { log: (l) => console.log(l) });

console.log(`\nloop stopped: ${out.stopped} after ${out.ticks} ticks`);

// ---- assertions ----
const tasks = co.listTasks();
assert.equal(tasks.length, 3, "expected 3 tasks");
assert.ok(tasks.every((t) => t.status === "done"), `all tasks done, got: ${tasks.map((t) => t.id + "=" + t.status).join(", ")}`);

const db = new DatabaseSync(path.join(co.dir, "data", "main.db"));
const row = db.prepare("SELECT COUNT(*) AS n FROM leads").get() as { n: number };
db.close();
assert.equal(row.n, 2, "expected 2 leads in db");

assert.ok(fs.existsSync(path.join(co.dir, "data", "summary.md")), "summary.md exists");
assert.ok(fs.existsSync(path.join(co.dir, "agents", "Digger", "workspace", "TASK-0002.md")), "worker thoughts recorded");

const inboxRead = path.join(co.dir, "agents", "Boss", "INBOX", "read");
assert.ok(fs.readdirSync(inboxRead).length >= 2, "boss received completion reports");

const types = co.auditTail(200).map((e) => e.type);
for (const t of ["company.launched", "task.created", "queue.enqueue", "queue.dequeue", "llm.call", "tool.sqlite", "tool.filesystem", "delivery.sent", "delivery.received", "task.completed"]) {
  assert.ok(types.includes(t), `audit contains ${t}`);
}
assert.ok(co.spent().tokens > 0 && co.spent().toolCalls === 4, "budget counters tracked");

// ---- connectors: ingest + tool registry (no live SMTP/Telegram) ----
assert.equal(resolveToolName("tg"), "telegram");
assert.equal(resolveToolName("mail"), "email");
assert.ok(toolsFor(["telegram"]).some((t) => t.name === "telegram"), "telegram tool registered");
const pad = mainMenuKeyboard(false);
assert.ok(pad.inline_keyboard.length >= 3, "telegram menu has button rows");
assert.ok(
  pad.inline_keyboard.flat().some((b) => b.callback_data === "t:s"),
  "telegram menu includes Status callback"
);
const beforeQ = co.queue().length;
const ing = ingestInbound(co, {
  channel: "webhook",
  from: "webhook:smoke",
  subject: "smoke inbound",
  body: "hello from smoke",
  externalId: "smoke-1",
  createTask: true,
});
assert.equal(ing.agent, "Boss");
assert.ok(ing.taskId, "inbound created a task");
assert.ok(co.queue().length === beforeQ + 1, "inbound task enqueued");
const unread = fs.readdirSync(path.join(co.dir, "agents", "Boss", "INBOX")).filter((f) => f.endsWith(".md"));
assert.ok(unread.length >= 1, "inbound landed in chief INBOX");

// ---- external agents: pull chief, push worker, manual reviewer (no LLM) ----
const ext = scaffoldCompany(
  root,
  {
    name: "External Co",
    goal: "Prove external agents work through the contract",
    approach: "Pull chief delegates to a push worker and a manual reviewer.",
    agents: [
      { name: "Lead", role: "Chief", rank: "chief", responsibilities: ["coordinate"], tools: [], skills: [], runtime: "external" },
      { name: "Runner", role: "Runner", rank: "worker", manager: "Lead", responsibilities: ["run"], tools: [], skills: [], runtime: "external", adapter: "smoke-sh" },
      { name: "Human", role: "Reviewer", rank: "worker", manager: "Lead", responsibilities: ["review"], tools: [], skills: [], runtime: "manual", approveResults: true },
    ],
    budget: { tokens: 100_000 },
    rootTasks: [{ title: "Ship it", description: "Run and review" }],
  },
  [],
  "mock"
);
cfg.agentRuntimes = {
  ...cfg.agentRuntimes,
  "smoke-sh": { type: "command", argv: ["sh", "-c", `echo 'working'; echo '{"action":"done","result":"ran {taskId} as '$AI_COMPANY_OS_AGENT'"}'`] },
};
assert.equal(ext.loadAgent("Runner").adapter, "smoke-sh", "runtime fields persist in profile.md");

const lead = claimNext(ext, "Lead");
assert.ok(lead && !lead.resumed, "pull agent claims its task");
assert.equal(claimNext(ext, "Lead")?.resumed, true, "second claim resumes the held task");
assert.throws(() => finishTask(ext, lead.task.id, "wrong-lease", "x"), WorkError, "foreign lease is refused");
delegateHeld(ext, lead.task.id, lead.lease.id, [
  { title: "Run", description: "run it", assignee: "Runner" },
  { title: "Review", description: "check it", assignee: "Human" },
]);
assert.equal(ext.loadTask(lead.task.id).status, "waiting", "delegating parks the parent");

await runLoop(ext, cfg, { replan: false, log: (l) => console.log(l) });
const run = ext.listTasks().find((t) => t.assignee === "Runner")!;
assert.equal(run.status, "done", "push worker ran via adapter");
assert.match(run.result ?? "", /ran TASK-\d+ as Runner/, "push result parsed from JSON reply");
assert.equal(ext.listTasks().find((t) => t.assignee === "Human")!.status, "queued", "engine never runs manual agents");

const human = claimNext(ext, "Human", "manual")!;
assert.equal(human.lease.via, "manual");
const reviewed = finishTask(ext, human.task.id, human.lease.id, "looks right");
assert.equal(reviewed.status, "review", "approveResults holds the result for the owner");
decideApproval(ext, reviewed.status === "review" ? reviewed.approval.id : "", true);
assert.equal(ext.loadTask(human.task.id).status, "done", "owner approval completes the task");

const back = claimNext(ext, "Lead")!;
assert.equal(back.task.id, lead.task.id, "parent returns to the pull chief");
assert.ok(renderBrief(ext, back.task, ext.loadAgent("Lead"), back.lease).includes("Results from your subtasks"), "brief carries child results");
finishTask(ext, back.task.id, back.lease.id, "shipped");
assert.ok(ext.listTasks().every((t) => t.status === "done"), "external company finished");

const late = ext.createTask({ title: "Late", description: "x", assignee: "Human", createdBy: "user" });
ext.enqueue(late.id);
const held = claimNext(ext, "Human")!;
held.task.lease = { ...held.lease, until: new Date(Date.now() - 1000).toISOString() };
ext.saveTask(held.task);
assert.deepEqual(expireLeases(ext), [late.id], "expired lease is reclaimed");
assert.equal(ext.loadTask(late.id).status, "queued", "expired task requeued as a retry");
assert.equal(ext.verifyAudit(), null, "audit chain intact");

// ---- remote work API: token auth, ownership, MCP over HTTP ----
const remoteAgent = ext.loadAgent("Human");
remoteAgent.tokenEnv = "SMOKE_TOKEN_HUMAN";
ext.saveAgent(remoteAgent);
process.env.SMOKE_TOKEN_HUMAN = "smoke-token-human-0123456789abcdef";
const remote = serveAgents(root, { port: 0, host: "127.0.0.1" });
await new Promise((r) => remote.once("listening", r));
const base = `http://127.0.0.1:${(remote.address() as { port: number }).port}`;
const call = (pathname: string, body: unknown, token?: string) =>
  fetch(base + pathname, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
assert.equal((await call("/api/work/external-co/next", {})).status, 401, "remote API needs a token");
const remoteNext = (await (await call("/api/work/external-co/next", {}, process.env.SMOKE_TOKEN_HUMAN)).json()) as {
  task: { id: string };
  lease: { id: string };
};
assert.equal(remoteNext.task.id, late.id, "remote agent claims its own task");
const tools = (await (
  await call("/mcp/external-co", { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, process.env.SMOKE_TOKEN_HUMAN)
).json()) as { result: { tools: { name: string }[] } };
assert.ok(tools.result.tools.some((t) => t.name === "work_done"), "remote MCP lists work tools");
const remoteDone = await call(
  "/api/work/external-co/done",
  { taskId: late.id, lease: remoteNext.lease.id, result: "done remotely" },
  process.env.SMOKE_TOKEN_HUMAN
);
assert.equal(((await remoteDone.json()) as { status: string }).status, "review", "remote done respects approveResults");
remote.close();

// ---- phase 7: lease minutes, monthly windows, mixed template ----
const timed = ext.createTask({ title: "Timed", description: "x", assignee: "Lead", createdBy: "user" });
ext.enqueue(timed.id);
const tc = claimNext(ext, "Lead")!;
tc.task.lease = { ...tc.lease, claimedAt: new Date(Date.now() - 12 * 60_000).toISOString() };
ext.saveTask(tc.task);
finishTask(ext, tc.task.id, tc.lease.id, "took a while", { tokens: 500 });
const leadUsage = usageReport(ext).agents.find((a) => a.name === "Lead")!;
assert.ok(leadUsage.minutes >= 11.9 && leadUsage.minutesMonth >= 11.9, "lease minutes booked to the holder");
assert.ok(leadUsage.tokensMonth >= 500, "reported tokens land in the month bucket");
ext.saveMeta({ budget: { ...ext.meta.budget, monthlyTokens: 400 } });
assert.match(ext.budgetExceeded() ?? "", /monthly token cap/, "monthly window blocks once used up");
ext.saveMeta({ budget: { ...ext.meta.budget, monthlyTokens: undefined } });
const leadSpec = ext.loadAgent("Lead");
leadSpec.monthlyBudgetTokens = 100;
ext.saveAgent(leadSpec);
assert.match(ext.agentBudgetExceeded(ext.loadAgent("Lead")) ?? "", /monthly budget/, "per-agent monthly cap");

const tpl = JSON.parse(fs.readFileSync(path.resolve(fileURLToPath(import.meta.url), "../../templates/mixed-lead-company.plan.json"), "utf8")) as Plan;
const mixed = scaffoldCompany(root, normalizePlan(tpl), [bundledSkills], "mock");
const runtimes = Object.fromEntries(mixed.listAgents().map((a) => [a.name, `${a.runtime ?? "internal"}${a.adapter ? "/" + a.adapter : ""}`]));
assert.deepEqual(runtimes, { Chief: "external/claude-code", LeadScout: "internal", Owner: "manual", Verifier: "external/codex" }, "template keeps runtimes");
assert.equal(mixed.meta.budget.monthlyTokens, 3_000_000, "template keeps the monthly cap");
assert.equal(mixed.loadAgent("Owner").approveResults, true);

console.log("\nSMOKE TEST PASSED ✓  (workspace: " + root + ")");
