import type { AgentSpec, Task } from "../types.js";
import type { Company } from "./store.js";

/** The org-level actions every agent has — internal ticks and external
 * agents (`work delegate` / `work message`) go through the same rules. */

export const MAX_SUBTASKS = 6;

export type SubtaskSpec = { title: string; description?: string; assignee: string };

export type DelegateOutcome =
  | { ok: true; created: Task[] }
  | { ok: false; error: string };

/** Split `task` into subtasks for the agent's direct reports. On success the
 * task is parked as waiting; it re-enqueues when the last child finishes. */
export function delegateTask(
  co: Company,
  task: Task,
  agent: AgentSpec,
  subtasks: SubtaskSpec[],
  opts: { depth: number; maxDepth: number }
): DelegateOutcome {
  const reports = co.directReports(agent.name);
  if (!reports.length) {
    return { ok: false, error: "you have no reports; do the work yourself and complete" };
  }
  if (opts.depth >= opts.maxDepth) {
    return { ok: false, error: "delegation depth limit reached; complete the task yourself" };
  }
  const valid = subtasks
    .filter((s) => s.title && s.assignee)
    .filter((s) => reports.some((r) => r.name === s.assignee));
  if (!valid.length) {
    return {
      ok: false,
      error: `no valid subtasks; assignees must be one of: ${reports.map((r) => r.name).join(", ")}`,
    };
  }
  const created = co.lock(() => {
    const out: Task[] = [];
    for (const s of valid.slice(0, MAX_SUBTASKS)) {
      const child = co.createTask({
        title: s.title,
        description: s.description || s.title,
        assignee: s.assignee,
        createdBy: agent.name,
        parent: task.id,
      });
      co.enqueue(child.id);
      co.sendMessage(agent.name, s.assignee, `new task ${child.id}: ${s.title}`, s.description || s.title, child.id);
      out.push(child);
    }
    task.status = "waiting";
    task.lease = undefined;
    co.saveTask(task);
    co.appendThought(
      agent.name,
      task.id,
      `**delegated:** ${valid.slice(0, MAX_SUBTASKS).map((s) => `${s.assignee}←"${s.title}"`).join("; ")}`
    );
    return out;
  });
  return { ok: true, created };
}

/** Drop a note into another agent's INBOX. */
export function messageAgent(
  co: Company,
  from: string,
  to: string,
  content: string,
  taskId?: string
): { ok: true } | { ok: false; error: string } {
  if (!co.listAgents().some((a) => a.name === to)) return { ok: false, error: `unknown agent "${to}"` };
  co.sendMessage(from, to, taskId ? `note re ${taskId}` : `note from ${from}`, content, taskId);
  return { ok: true };
}
