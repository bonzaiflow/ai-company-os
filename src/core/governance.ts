import fs from "node:fs";
import path from "node:path";
import type { Approval } from "../types.js";
import { ensureDir, nowIso, readJson, truncate, writeJson } from "../util.js";
import type { Company } from "./store.js";

/** Owner approval gates. When a tool is listed in company policies.approveTools,
 * an agent's call to it parks the task and files an approval request; the
 * owner approves or denies (UI / `ai-company-os approve`), which re-enqueues the task.
 * On its next attempt the agent's matching call executes (approved) or gets a
 * refusal observation (denied). Everything lands in the audit chain. */

function approvalsDir(co: Company): string {
  return path.join(co.dir, "approvals");
}

export function listApprovals(co: Company, status?: Approval["status"]): Approval[] {
  const dir = approvalsDir(co);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<Approval | null>(path.join(dir, f), null))
    .filter((a): a is Approval => !!a)
    .filter((a) => !status || a.status === status)
    .sort((a, b) => a.ts.localeCompare(b.ts));
}

function saveApproval(co: Company, a: Approval): void {
  ensureDir(approvalsDir(co));
  writeJson(path.join(approvalsDir(co), `${a.id}.json`), a);
}

export function requestApproval(
  co: Company,
  agent: string,
  taskId: string,
  tool: string,
  args: Record<string, unknown>
): Approval {
  const id = `APR-${String(listApprovals(co).length + 1).padStart(4, "0")}`;
  const a: Approval = { id, ts: nowIso(), agent, taskId, tool, args, status: "pending" };
  saveApproval(co, a);
  co.audit({
    type: "approval.requested",
    ok: true,
    agent,
    taskId,
    detail: `${id}: ${tool} ${truncate(JSON.stringify(args), 140)}`,
  });
  return a;
}

/** An open decision for this task+tool: pending blocks, approved allows once,
 * denied refuses once. */
export function findDecision(co: Company, taskId: string, tool: string): Approval | undefined {
  return listApprovals(co).find(
    (a) => a.taskId === taskId && a.tool === tool && a.status !== "consumed"
  );
}

export function consumeApproval(co: Company, a: Approval): void {
  a.status = "consumed";
  saveApproval(co, a);
}

export function decideApproval(
  co: Company,
  id: string,
  approve: boolean,
  note?: string
): Approval {
  const a = listApprovals(co).find((x) => x.id === id);
  if (!a) throw new Error(`no approval ${id}`);
  if (a.status !== "pending") throw new Error(`${id} already ${a.status}`);
  a.status = approve ? "approved" : "denied";
  a.decidedAt = nowIso();
  a.note = note;
  saveApproval(co, a);
  co.audit({
    type: approve ? "approval.granted" : "approval.denied",
    ok: true,
    taskId: a.taskId,
    detail: `${id} by owner${note ? `: ${note}` : ""}`,
  });
  // wake the parked task so the agent can proceed (or hear the refusal)
  const task = co.loadTask(a.taskId);
  if (task.status === "waiting" || task.status === "queued") {
    task.status = "queued";
    co.saveTask(task);
    if (!co.queue().includes(task.id)) co.enqueue(task.id);
  }
  return a;
}
