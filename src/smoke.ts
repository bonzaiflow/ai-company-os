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
import { ingestInbound } from "./core/connectors/index.js";
import { runLoop } from "./core/runtime.js";
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

console.log("\nSMOKE TEST PASSED ✓  (workspace: " + root + ")");
