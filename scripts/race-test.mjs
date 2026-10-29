#!/usr/bin/env node
/**
 * Cross-process safety test: several processes claim and finish tasks of the
 * same company at once. Passes when no task is claimed twice, every task is
 * done and the audit hash chain is intact. Needs `npm run build` first.
 *
 *   node scripts/race-test.mjs [workers=4] [tasks=60]
 */
import assert from "node:assert";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AUDIT_PER_WORKER = 300;
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const { Company, scaffoldCompany } = await import(path.join(DIST, "core/store.js"));
const { claimReadyWave } = await import(path.join(DIST, "core/queue.js"));
const { completeTask } = await import(path.join(DIST, "core/task-lifecycle.js"));

if (process.argv[2] === "--worker") {
  const co = new Company(process.argv[3]);
  const nap = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  nap(Math.max(0, Number(process.argv[4]) - Date.now())); // start together
  for (;;) {
    const [id] = claimReadyWave(co, 1);
    if (!id) {
      if (!co.queue().length) break;
      nap(2); // everything ready is taken — let the holders finish
      continue;
    }
    process.stdout.write(id + "\n");
    nap(3); // "work" outside the lock so the others interleave
    const t = co.loadTask(id);
    completeTask(co, t, t.assignee, `done by ${process.pid}`);
  }
  // phase 2: hammer the audit hash chain and the queue file directly
  nap(Math.max(0, Number(process.argv[5]) - Date.now()));
  for (let i = 0; i < AUDIT_PER_WORKER; i++) {
    co.audit({ type: "race.audit", ok: true, detail: `${process.pid}#${i}` });
    if (i % 10 === 0) co.enqueue(`X-${process.pid}-${i}`);
  }
  process.exit(0);
}

const workers = Number(process.argv[2] ?? 4);
const n = Number(process.argv[3] ?? 60);
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-company-os-race-"));
const agents = Array.from({ length: 12 }, (_, i) => ({
  name: `W${i}`,
  role: "worker",
  rank: "worker",
  responsibilities: ["work"],
  tools: [],
  skills: [],
}));
const co = scaffoldCompany(
  root,
  { name: "Race", goal: "race", approach: "-", agents, budget: { tokens: 0 }, rootTasks: [] },
  [],
  "mock"
);
for (let i = 0; i < n; i++) {
  const t = co.createTask({ title: `t${i}`, description: "x", assignee: `W${i % agents.length}`, createdBy: "user" });
  co.enqueue(t.id);
}

const self = fileURLToPath(import.meta.url);
const startAt = String(Date.now() + 1500);
// phase 2 starts once phase 1 surely finished in every worker
const phase2At = String(Date.now() + 1500 + Math.max(4000, n * 60));
const outputs = await Promise.all(
  Array.from({ length: workers }, () =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["--no-warnings", self, "--worker", co.dir, startAt, phase2At], { stdio: ["ignore", "pipe", "inherit"] });
      let out = "";
      child.stdout.on("data", (d) => (out += d));
      child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`worker exit ${code}`))));
    })
  )
);

const claims = outputs.flatMap((o) => o.trim().split("\n").filter(Boolean));
const perWorker = outputs.map((o) => o.trim().split("\n").filter(Boolean).length);
const dupes = claims.filter((id, i) => claims.indexOf(id) !== i);
assert.deepEqual(dupes, [], `tasks claimed twice: ${dupes.join(", ")}`);
assert.equal(claims.length, n, `expected ${n} claims, got ${claims.length}`);
assert.ok(co.listTasks().every((t) => t.status === "done"), "every task done");
const queued = co.queue();
assert.equal(queued.length, workers * (AUDIT_PER_WORKER / 10), `queue lost updates: ${queued.length} of ${workers * (AUDIT_PER_WORKER / 10)} enqueues kept`);
assert.equal(co.auditTail(1e6).filter((e) => e.type === "race.audit").length, workers * AUDIT_PER_WORKER, "every audit event written");
assert.equal(co.verifyAudit(), null, "audit hash chain intact");
assert.ok(!fs.existsSync(path.join(co.dir, ".lock")), "lock released");
console.log(`RACE TEST PASSED ✓  ${n} tasks over ${workers} processes (${perWorker.join("/")})`);
fs.rmSync(root, { recursive: true, force: true });
