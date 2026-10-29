import path from "node:path";
import type { AgentSpec, Approval, Task, TaskLease } from "../types.js";
import { truncate } from "../util.js";
import { claimsToday, countClaim, endLease, isLeased, leaseExpired, leaseMinutesFor, newLease } from "./agent-runtime.js";
import { RESULT_REVIEW, requestApproval } from "./governance.js";
import { expireLeases, readyCandidates } from "./queue.js";
import type { Company } from "./store.js";
import { completeTask, failTask, retryOrFail, taskDepth } from "./task-lifecycle.js";
import { delegateTask, type DelegateOutcome, type SubtaskSpec } from "./work.js";

/** The external work contract: an outside agent claims a task under a lease,
 * keeps it alive with heartbeats and ends it with done / fail / delegate /
 * release. Every call carries the lease id, so two sessions acting as the
 * same agent can never finish each other's work. See docs/AGENT-CONTRACT.md. */

export type WorkErrorKind = "input" | "lease" | "blocked";

export class WorkError extends Error {
  constructor(
    message: string,
    public kind: WorkErrorKind
  ) {
    super(message);
  }
}

/** CLI exit codes of the contract (3 = nothing to do is not an error). */
export const WORK_EXIT = { input: 2, idle: 3, lease: 4, blocked: 5 } as const;

/** Max delegation depth for external agents — same default as the tick engine. */
const MAX_DEPTH = 2;

export function workAgent(co: Company, name: string): AgentSpec {
  if (!co.listAgents().some((a) => a.name === name)) {
    throw new WorkError(`unknown agent "${name}"`, "input");
  }
  const agent = co.loadAgent(name);
  if (!isLeased(agent)) {
    throw new WorkError(
      `${name} is an internal agent — the engine runs it. Set "runtime: external" (or manual) in its profile to work it from outside.`,
      "input"
    );
  }
  return agent;
}

/** Inbox messages consumed at claim time are kept next to the task so the
 * brief can show them again (`work brief` may be called many times). */
export function claimInboxFile(co: Company, agent: string, taskId: string): string {
  return path.join(co.agentDir(agent), "workspace", `${taskId}.inbox.md`);
}

export type Claim = { task: Task; lease: TaskLease; resumed: boolean };

/** Claim the next ready task of `name`, or resume the one it already holds.
 * Returns null when there is nothing to do. */
export function claimNext(co: Company, name: string, via: "pull" | "manual" = "pull"): Claim | null {
  const agent = workAgent(co, name);
  expireLeases(co);
  return co.lock(() => {
    const held = co
      .listTasks()
      .find((t) => t.status === "running" && t.assignee === name && t.lease && !leaseExpired(t.lease));
    if (held) return { task: held, lease: held.lease!, resumed: true };

    if (co.meta.paused) throw new WorkError("company is paused", "blocked");
    const over = co.budgetExceeded();
    if (over) throw new WorkError(`budget: ${over}`, "blocked");
    const agentOver = co.agentBudgetExceeded(agent);
    if (agentOver) throw new WorkError(agentOver, "blocked");
    if (agent.maxTasksPerDay && claimsToday(co, name) >= agent.maxTasksPerDay) {
      throw new WorkError(`${name} reached maxTasksPerDay (${agent.maxTasksPerDay})`, "blocked");
    }

    const next = readyCandidates(co, name)[0];
    if (!next) return null;
    co.dequeueMany([next.id]);
    next.status = "running";
    next.startedAt = new Date().toISOString();
    next.lease = newLease(agent, runtimeVia(agent, via));
    co.saveTask(next);
    countClaim(co, name);
    keepClaimInbox(co, name, next.id);
    co.audit({ type: "task.claimed", ok: true, taskId: next.id, agent: name, detail: `${next.lease.via} lease ${next.lease.id}` });
    return { task: next, lease: next.lease, resumed: false };
  });
}

function runtimeVia(agent: AgentSpec, via: "pull" | "manual"): TaskLease["via"] {
  return agent.runtime === "manual" ? "manual" : via;
}

/** Move the agent's unread inbox next to the claimed task (claimNext and push runs). */
export function keepClaimInbox(co: Company, agent: string, taskId: string): void {
  const msgs = co.readInbox(agent);
  if (!msgs.length) return;
  const text = msgs.map((m) => `### From ${m.from}: ${m.subject}\n${m.content}`).join("\n\n") + "\n\n";
  co.appendThought(agent, `${taskId}.inbox`, text);
}

/** Load a running task and check the caller still holds its lease. */
export function heldTask(co: Company, taskId: string, leaseId: string): Task {
  let task: Task;
  try {
    task = co.loadTask(taskId);
  } catch {
    throw new WorkError(`unknown task ${taskId}`, "input");
  }
  if (task.status !== "running" || !task.lease) {
    throw new WorkError(`${taskId} is ${task.status}, not held by anyone`, "lease");
  }
  if (task.lease.id !== leaseId) {
    throw new WorkError(`${taskId} is held under a different lease (by ${task.lease.holder})`, "lease");
  }
  if (leaseExpired(task.lease)) {
    expireLeases(co);
    throw new WorkError(`lease ${leaseId} on ${taskId} expired — the task went back to the queue`, "lease");
  }
  return task;
}

/** Extend the lease by its TTL, capped at claimedAt + maxMinutesPerTask. */
export function heartbeat(co: Company, taskId: string, leaseId: string): TaskLease {
  return co.lock(() => {
    const task = heldTask(co, taskId, leaseId);
    const agent = co.loadAgent(task.assignee);
    const lease = task.lease!;
    const now = Date.now();
    let until = now + leaseMinutesFor(agent) * 60_000;
    if (agent.maxMinutesPerTask) {
      until = Math.min(until, Date.parse(lease.claimedAt) + agent.maxMinutesPerTask * 60_000);
    }
    lease.until = new Date(until).toISOString();
    lease.heartbeatAt = new Date(now).toISOString();
    lease.beats = (lease.beats ?? 0) + 1;
    co.saveTask(task);
    if (lease.beats === 1 || lease.beats % 5 === 0) {
      co.audit({ type: "task.heartbeat", ok: true, taskId, agent: lease.holder, detail: `#${lease.beats} until ${lease.until}` });
    }
    return lease;
  });
}

/** Give the task back unfinished (front of the queue, no attempt counted). */
export function releaseTask(co: Company, taskId: string, leaseId: string, reason?: string): Task {
  return co.lock(() => {
    const task = heldTask(co, taskId, leaseId);
    const holder = task.lease!.holder;
    endLease(co, task);
    task.status = "queued";
    co.saveTask(task);
    co.enqueueFront(task.id);
    co.audit({ type: "task.released", ok: true, taskId, agent: holder, detail: reason ?? "released by holder" });
    return task;
  });
}

export type DoneOutcome =
  | { status: "done" | "queued"; task: Task }
  | { status: "review"; task: Task; approval: Approval };

/** Report the result. With approveResults the owner reviews it first. */
export function finishTask(
  co: Company,
  taskId: string,
  leaseId: string,
  result: string,
  opts: { tokens?: number; via?: string } = {}
): DoneOutcome {
  return co.lock(() => {
    const task = heldTask(co, taskId, leaseId);
    const agent = co.loadAgent(task.assignee);
    const lease = task.lease!;
    if (opts.tokens && opts.tokens > 0) co.addSpent(opts.tokens, 0, agent.name);
    co.appendThought(agent.name, task.id, `**completed (${lease.via}${opts.via ? `, ${opts.via}` : ""}):** ${truncate(result, 500)}`);
    if (agent.approveResults) {
      endLease(co, task);
      task.status = "waiting";
      co.saveTask(task);
      const approval = requestApproval(co, agent.name, task.id, RESULT_REVIEW, { result });
      return { status: "review", task, approval };
    }
    completeTask(co, task, agent.name, result);
    co.audit({
      type: "task.external",
      ok: true,
      taskId,
      agent: agent.name,
      detail: `${lease.via}${agent.adapter ? ` via ${agent.adapter}` : ""}${opts.via ? ` (${opts.via})` : ""}`,
    });
    return { status: task.status === "done" ? "done" : "queued", task };
  });
}

/** Report failure. retry=true counts an attempt and requeues while attempts remain. */
export function failHeld(co: Company, taskId: string, leaseId: string, reason: string, retry = true): Task {
  return co.lock(() => {
    const task = heldTask(co, taskId, leaseId);
    if (retry) retryOrFail(co, task, task.assignee, reason);
    else failTask(co, task, task.assignee, reason);
    return task;
  });
}

/** Split the held task into subtasks for the agent's direct reports. */
export function delegateHeld(co: Company, taskId: string, leaseId: string, subtasks: SubtaskSpec[]): DelegateOutcome {
  return co.lock(() => {
    const task = heldTask(co, taskId, leaseId);
    const agent = co.loadAgent(task.assignee);
    const out = delegateTask(co, task, agent, subtasks, { depth: taskDepth(co, task), maxDepth: MAX_DEPTH });
    if (!out.ok) throw new WorkError(out.error, "input");
    return out;
  });
}

/** Owner takes a held task back (UI / CLI): front of the queue, no attempt. */
export function ownerRelease(co: Company, taskId: string): Task {
  return co.lock(() => {
    const task = co.loadTask(taskId);
    if (task.status !== "running" || !task.lease) throw new WorkError(`${taskId} is not held by an external agent`, "lease");
    return releaseTask(co, taskId, task.lease.id, "released by owner");
  });
}

/** Owner enters the outcome for an external/manual agent's task — e.g. the
 * answer pasted back from a chat window. Counts as owner-approved. */
export function ownerReport(co: Company, taskId: string, result: string, failed = false): Task {
  return co.lock(() => {
    const task = co.loadTask(taskId);
    const agent = co.loadAgent(task.assignee);
    if (!isLeased(agent)) throw new WorkError(`${task.assignee} is an internal agent`, "input");
    if (task.status === "queued") {
      co.dequeueMany([task.id]);
    } else if (task.status !== "running") {
      throw new WorkError(`${taskId} is ${task.status}`, "input");
    }
    endLease(co, task);
    task.status = "running";
    co.appendThought(agent.name, task.id, `**reported by owner:** ${truncate(result, 500)}`);
    if (failed) retryOrFail(co, task, agent.name, result);
    else completeTask(co, task, agent.name, result);
    co.audit({ type: "task.external", ok: !failed, taskId, agent: agent.name, detail: "reported by owner" });
    return task;
  });
}
