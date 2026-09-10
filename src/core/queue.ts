import type { Task } from "../types.js";
import { PRIORITY_RANK } from "./priority.js";
import type { Company } from "./store.js";

/** Fail every queued/waiting task and clear queue.json. Running tasks are left alone
 * (cooperative stop is a separate control). Skips parent-wake so a bulk flush does
 * not re-enqueue anything mid-pass. */
export function flushQueue(co: Company): { flushed: string[]; leftRunning: string[] } {
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

/** Recover tasks orphaned in "running" by a killed process (e.g. a dev-mode
 * server restart mid-tick). staleMinutes 0 = requeue all running tasks. */
export function requeueStuckRunning(co: Company, staleMinutes = 0): number {
  let n = 0;
  for (const t of co.listTasks()) {
    if (t.status !== "running") continue;
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

/** Claim up to maxParallel queued tasks with distinct assignees and no
 * unfinished children. Marks them running and removes them from the queue.
 * Higher priority wins; queue order breaks ties. */
export function claimReadyWave(co: Company, maxParallel = 4): string[] {
  promoteWaitingParents(co);
  const busy = new Set(
    co.listTasks().filter((t) => t.status === "running").map((t) => t.assignee)
  );
  const queue = co.queue();
  const candidates: { t: Task; idx: number }[] = [];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    let t: Task;
    try {
      t = co.loadTask(id);
    } catch {
      continue;
    }
    if (t.status !== "queued") continue;
    const kids = co.children(id);
    if (kids.some((c) => c.status !== "done" && c.status !== "failed")) continue;
    candidates.push({ t, idx: i });
  }
  candidates.sort((a, b) => {
    const pd = PRIORITY_RANK[b.t.priority] - PRIORITY_RANK[a.t.priority];
    return pd !== 0 ? pd : a.idx - b.idx;
  });

  const claim: string[] = [];
  for (const { t } of candidates) {
    if (claim.length >= maxParallel) break;
    if (busy.has(t.assignee)) continue;
    claim.push(t.id);
    busy.add(t.assignee);
  }
  if (!claim.length) return [];
  co.dequeueMany(claim);
  for (const id of claim) {
    const t = co.loadTask(id);
    t.status = "running";
    co.saveTask(t);
  }
  return claim;
}
