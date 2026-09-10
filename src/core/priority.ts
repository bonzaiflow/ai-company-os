import type { Task } from "../types.js";
import type { Company } from "./store.js";

export const PRIORITY_RANK: Record<Task["priority"], number> = {
  low: 0,
  normal: 1,
  high: 2,
};

const PRIORITY_UP: Record<Task["priority"], Task["priority"]> = {
  low: "normal",
  normal: "high",
  high: "high",
};

/** Open descendants first (must finish before parent), then the task itself. */
export function openDescendantsThenSelf(co: Company, id: string): Task[] {
  const t = co.loadTask(id);
  const out: Task[] = [];
  for (const c of co.children(id)) {
    if (c.status === "done" || c.status === "failed") continue;
    out.push(...openDescendantsThenSelf(co, c.id));
  }
  if (t.status !== "done" && t.status !== "failed") out.push(t);
  return out;
}

/** Raise a task's priority one step (low→normal→high). Unfinished children
 * in the dependency chain are raised to at least the same level and moved
 * ahead in the queue so they can run before the parent. Waiting parents are
 * parked in the queue immediately under their blockers.
 * Pass force:true to re-assert placement even when already high + front. */
export function raiseTaskPriority(
  co: Company,
  id: string,
  opts: { force?: boolean } = {}
):
  | { ok: true; priority: Task["priority"]; chain: string[]; moved: string[]; forced?: boolean }
  | { ok: false; error: string; code?: string } {
  let task: Task;
  try {
    task = co.loadTask(id);
  } catch {
    return { ok: false, error: "task not found" };
  }
  if (task.status === "done" || task.status === "failed") {
    return { ok: false, error: `${id} is ${task.status} — priority can't be changed` };
  }
  if (task.status === "running") {
    return { ok: false, error: `${id} is already running` };
  }

  const next = PRIORITY_UP[task.priority];
  const chain = openDescendantsThenSelf(co, id);
  const raised: string[] = [];
  for (const t of chain) {
    if (PRIORITY_RANK[t.priority] < PRIORITY_RANK[next]) {
      t.priority = next;
      co.saveTask(t);
      raised.push(t.id);
    }
  }

  // Blockers first (queued children), then park this task right under them.
  const blockers = chain.filter((t) => t.id !== id && t.status === "queued").map((t) => t.id);
  co.prioritizeInQueue(blockers);

  const qBefore = co.queue();
  const afterId = blockers.length ? blockers[blockers.length - 1]! : null;
  const alreadyPlaced = afterId
    ? qBefore.indexOf(id) === qBefore.indexOf(afterId) + 1
    : qBefore[0] === id;

  if (task.status === "queued" || task.status === "waiting") {
    co.placeInQueueAfter(id, afterId);
  }

  const moved = [...blockers];
  if (task.status === "queued" || task.status === "waiting") moved.push(id);

  if (!raised.length && alreadyPlaced && task.priority === "high" && !opts.force) {
    const waitingOn = chain.filter((t) => t.id !== id);
    return {
      ok: false,
      code: "already_front",
      error: waitingOn.length
        ? `${id} is already high priority and queued right under ${waitingOn.map((t) => t.id).join(", ")}`
        : `${id} is already highest priority and at the front of the queue`,
    };
  }

  co.audit({
    type: "task.priority",
    ok: true,
    taskId: id,
    detail:
      (opts.force ? "forced " : "") +
      `→ ${next}` +
      (blockers.length ? `; under ${blockers.join(",")}` : "") +
      (chain.length > 1 ? `; deps ${chain.map((t) => t.id).join(",")}` : ""),
  });
  return {
    ok: true,
    priority: next,
    chain: chain.map((t) => t.id),
    moved,
    forced: !!opts.force,
  };
}
