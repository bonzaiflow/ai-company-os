import type { AgentSpec, Task } from "../types.js";
import { agentIndex, countClaim, endLease, engineRuns, isLeased, leaseExpired, newLease, overDailyLimit } from "./agent-runtime.js";
import { PRIORITY_RANK } from "./priority.js";
import type { Company } from "./store.js";
import { retryOrFail } from "./task-lifecycle.js";

/** Fail every queued/waiting task and clear queue.json. Running tasks are left alone
 * (cooperative stop is a separate control). Skips parent-wake so a bulk flush does
 * not re-enqueue anything mid-pass. */
export function flushQueue(co: Company): { flushed: string[]; leftRunning: string[] } {
  return co.lock(() => flushQueueLocked(co));
}

function flushQueueLocked(co: Company): { flushed: string[]; leftRunning: string[] } {
  const flushed: string[] = [];
  const leftRunning: string[] = [];
  for (const t of co.listTasks()) {
    if (t.status === "running") {
      leftRunning.push(t.id);
      continue;
    }
    if (t.status !== "queued" && t.status !== "waiting") continue;
    t.status = "failed";
    t.result = "FLUSHED by owner — removed from queue";
    co.saveTask(t);
    flushed.push(t.id);
  }
  co.clearQueue();
  if (flushed.length) {
    co.audit({
      type: "queue.flushed",
      ok: true,
      detail:
        `${flushed.length} task${flushed.length === 1 ? "" : "s"} flushed` +
        (leftRunning.length ? `; ${leftRunning.length} still running` : ""),
    });
  }
  return { flushed, leftRunning };
}

/** Crash-safety sweep: re-enqueue waiting parents whose children all finished
 * (normally this happens the moment the last child completes). */
export function promoteWaitingParents(co: Company): void {
  co.lock(() => promoteWaitingParentsLocked(co));
}

function promoteWaitingParentsLocked(co: Company): void {
  for (const t of co.listTasks()) {
    if (t.status !== "waiting") continue;
    const children = co.children(t.id);
    if (children.length && children.every((c) => c.status === "done" || c.status === "failed")) {
      if (!co.queue().includes(t.id)) {
        t.status = "queued";
        co.saveTask(t);
        co.enqueue(t.id);
      }
    }
  }
}

/** Hand back tasks whose external holder stopped heartbeating. Each expiry
 * counts as a failed attempt, so a crashing agent cannot loop forever. */
export function expireLeases(co: Company): string[] {
  return co.lock(() => {
    const expired: string[] = [];
    for (const t of co.listTasks()) {
      if (t.status !== "running" || !t.lease || !leaseExpired(t.lease)) continue;
      const lease = t.lease;
      endLease(co, t);
      co.audit({
        type: "lease.expired",
        ok: false,
        taskId: t.id,
        agent: lease.holder,
        detail: `${lease.via} lease ${lease.id} ran out at ${lease.until}`,
      });
      retryOrFail(co, t, t.assignee, `lease expired — ${lease.holder} stopped reporting (no heartbeat/done)`);
      expired.push(t.id);
    }
    return expired;
  });
}

/** Recover tasks orphaned in "running" by a killed process (e.g. a dev-mode
 * server restart mid-tick). staleMinutes 0 = requeue all running tasks.
 * Leased tasks are never requeued here while their lease is valid — an
 * external agent may legitimately work for a long time. */
export function requeueStuckRunning(co: Company, staleMinutes = 0): number {
  expireLeases(co);
  return co.lock(() => requeueStuckRunningLocked(co, staleMinutes));
}

function requeueStuckRunningLocked(co: Company, staleMinutes: number): number {
  let n = 0;
  for (const t of co.listTasks()) {
    if (t.status !== "running" || t.lease) continue;
    const ageMin = (Date.now() - Date.parse(t.updatedAt)) / 60_000;
    if (ageMin < staleMinutes) continue;
    t.status = "queued";
    co.saveTask(t);
    co.enqueue(t.id);
    co.audit({ type: "task.recovered", ok: true, taskId: t.id, detail: "was stuck in running" });
    n++;
  }
  return n;
}

/** Queued tasks with no unfinished children, best first (priority, then
 * queue order). Optionally limited to one assignee. */
export function readyCandidates(co: Company, assignee?: string): Task[] {
  const queue = co.queue();
  // one pass over the task files — this runs under the company lock
  const all = co.listTasks();
  const byId = new Map(all.map((t) => [t.id, t]));
  const open = new Set(
    all.filter((t) => t.parent && t.status !== "done" && t.status !== "failed").map((t) => t.parent!)
  );
  const candidates: { t: Task; idx: number }[] = [];
  for (let i = 0; i < queue.length; i++) {
    const t = byId.get(queue[i]!);
    if (!t || t.status !== "queued") continue;
    if (assignee && t.assignee !== assignee) continue;
    if (open.has(t.id)) continue;
    candidates.push({ t, idx: i });
  }
  candidates.sort((a, b) => {
    const pd = PRIORITY_RANK[b.t.priority] - PRIORITY_RANK[a.t.priority];
    return pd !== 0 ? pd : a.idx - b.idx;
  });
  return candidates.map((c) => c.t);
}

/** Claim up to maxParallel queued tasks with distinct assignees and no
 * unfinished children. Marks them running and removes them from the queue.
 * Higher priority wins; queue order breaks ties. Only tasks the engine runs
 * itself are claimed — internal agents and external agents with a push
 * adapter (those get a push lease). Pull/manual agents claim via `work next`. */
export function claimReadyWave(co: Company, maxParallel = 4): string[] {
  promoteWaitingParents(co);
  return co.lock(() => {
    const agents = agentIndex(co);
    const busy = new Set(
      co.listTasks().filter((t) => t.status === "running").map((t) => t.assignee)
    );
    const claim: string[] = [];
    for (const t of readyCandidates(co)) {
      if (claim.length >= maxParallel) break;
      if (busy.has(t.assignee)) continue;
      const agent: AgentSpec | undefined = agents.get(t.assignee);
      if (agent && (!engineRuns(agent) || (isLeased(agent) && overDailyLimit(co, agent)))) continue;
      claim.push(t.id);
      busy.add(t.assignee);
    }
    if (!claim.length) return [];
    co.dequeueMany(claim);
    for (const id of claim) {
      const t = co.loadTask(id);
      t.status = "running";
      t.startedAt = new Date().toISOString();
      const agent = agents.get(t.assignee);
      if (agent && isLeased(agent)) {
        t.lease = newLease(agent, "push", process.pid);
        countClaim(co, agent.name);
        co.audit({ type: "task.claimed", ok: true, taskId: id, agent: agent.name, detail: `push lease ${t.lease.id}` });
      }
      co.saveTask(t);
    }
    return claim;
  });
}
