import type { Task } from "../types.js";
import { truncate } from "../util.js";
import type { Company } from "./store.js";

const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_CONTINUATIONS = 12;

export const MAX_STUCK_TICKS = 3; // consecutive no-progress ticks before a task truly fails

export function taskDepth(co: Company, task: Task): number {
  let depth = 0;
  let cur = task;
  while (cur.parent && depth < 10) {
    cur = co.loadTask(cur.parent);
    depth++;
  }
  return depth;
}

/** When the last sibling finishes, wake a waiting parent for synthesis. */
function wakeWaitingParent(co: Company, task: Task): void {
  if (!task.parent) return;
  const parent = co.loadTask(task.parent);
  const siblings = co.children(task.parent);
  if (
    parent.status === "waiting" &&
    siblings.every((s) => s.status === "done" || s.status === "failed")
  ) {
    parent.status = "queued";
    co.saveTask(parent);
    co.enqueue(parent.id);
  }
}

/** Returns true if a target task was NOT yet met but is still making progress,
 * so it should be re-driven rather than marked done. */
export function continueTowardTarget(
  co: Company,
  task: Task,
  agent: string,
  _result: string
): boolean {
  if (!task.target) return false;
  const have = co.measure(task.target);
  const need = task.target.count;
  if (have >= need) return false;

  const prev = task.lastCount ?? 0;
  const cont = (task.continuations ?? 0) + 1;
  const progressed = have > prev;
  task.lastCount = have;
  task.continuations = cont;

  if (!progressed || cont > MAX_CONTINUATIONS) {
    co.audit({
      type: "target.stalled",
      ok: false,
      taskId: task.id,
      agent,
      detail: `${have}/${need} in ${task.target.table}`,
    });
    task._partialNote =
      `PARTIAL: reached ${have}/${need} rows in ${task.target.table}` +
      (progressed
        ? ` (continuation cap ${MAX_CONTINUATIONS} hit)`
        : ` — no new rows last round, source likely exhausted`) +
      ".";
    return false;
  }

  task.status = "queued";
  task.result = `IN PROGRESS: ${have}/${need} rows in ${task.target.table} (round ${cont}).`;
  co.saveTask(task);
  if (!co.queue().includes(task.id)) co.enqueue(task.id);
  co.audit({
    type: "target.continue",
    ok: true,
    taskId: task.id,
    agent,
    detail: `${have}/${need} in ${task.target.table} — +${have - prev} this round, continuing`,
  });
  return true;
}

export function completeTask(co: Company, task: Task, agent: string, result: string): void {
  if (continueTowardTarget(co, task, agent, result)) return;

  task.status = "done";
  task.result = task._partialNote ? `${task._partialNote}\n\n${result}` : result;
  co.saveTask(task);
  co.audit({ type: "task.completed", ok: true, taskId: task.id, agent });

  const spec = co.loadAgent(agent);
  const report = `Task ${task.id} "${task.title}" finished.\n\n${result}`;
  if (spec.manager) {
    co.sendMessage(agent, spec.manager, `done: ${task.title}`, report, task.id);
  }
  wakeWaitingParent(co, task);
}

export function failTask(co: Company, task: Task, agent: string, reason: string): void {
  task.status = "failed";
  task.result = `FAILED: ${reason}`;
  co.saveTask(task);
  co.audit({ type: "task.failed", ok: false, taskId: task.id, agent, detail: reason });
  const spec = co.loadAgent(agent);
  if (spec.manager) {
    co.sendMessage(agent, spec.manager, `failed: ${task.title}`, reason, task.id);
  }
  wakeWaitingParent(co, task);
}

/** Retry with context until the attempt budget is spent, then fail terminally. */
export function retryOrFail(
  co: Company,
  task: Task,
  agent: string,
  reason: string
): "retried" | "failed" {
  const attempts = (task.attempts ?? 0) + 1;
  const max = task.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  task.attempts = attempts;
  if (attempts < max) {
    task.status = "queued";
    task.result = `FAILED (attempt ${attempts}/${max}): ${reason}`;
    co.saveTask(task);
    co.enqueue(task.id);
    co.audit({
      type: "task.retry",
      ok: true,
      taskId: task.id,
      agent,
      detail: `attempt ${attempts}/${max} failed: ${truncate(reason, 140)} — re-queued`,
    });
    co.appendThought(agent, task.id, `\n**attempt ${attempts} failed:** ${reason} — will retry`);
    return "retried";
  }
  failTask(co, task, agent, `${reason} (after ${attempts} attempts)`);
  return "failed";
}
