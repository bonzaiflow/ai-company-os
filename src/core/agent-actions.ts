import type { AgentAction, AgentSpec, Task } from "../types.js";
import { truncate } from "../util.js";
import { consumeApproval, findDecision, requestApproval } from "./governance.js";
import type { Company } from "./store.js";
import { completeTask } from "./task-lifecycle.js";
import { resolveToolName, type Tool } from "./tools.js";
import type { TickResult } from "./tick-types.js";

export type Gate = <T>(fn: () => T | Promise<T>) => Promise<T>;

export type ActionStepResult =
  | { kind: "continue"; toolOkDelta?: number }
  | { kind: "return"; result: TickResult };

/** Normalize small-model action quirks before execution. */
export function normalizeAgentAction(action: AgentAction, tools: Tool[]): void {
  if (!["tool", "delegate", "message", "complete"].includes(action.action)) {
    if (tools.some((t) => t.name === (action.action as string))) {
      action.tool = action.action as string;
      action.action = "tool";
    }
  }
  if (action.action === "tool" && action.tool) action.tool = resolveToolName(action.tool);
  if (action.action === "tool" && !tools.some((t) => t.name === action.tool)) {
    const a = action.args ?? {};
    const inferred = a.query
      ? "search"
      : a.sql || a.db
        ? "sqlite"
        : a.url
          ? "fetch"
          : a.op || a.path
            ? "filesystem"
            : null;
    if (inferred && tools.some((t) => t.name === inferred)) action.tool = inferred;
  }
}

export interface ExecuteActionCtx {
  co: Company;
  task: Task;
  agent: AgentSpec;
  meta: Company["meta"];
  tools: Tool[];
  reports: AgentSpec[];
  depth: number;
  maxDepth: number;
  step: number;
  transcript: string[];
  gate: Gate;
  log: (line: string) => void;
  shouldStop?: () => boolean;
  taskId: string;
}

/** Run one normalized agent action. May continue the step loop or end the tick. */
export async function executeAgentAction(
  ctx: ExecuteActionCtx,
  action: AgentAction
): Promise<ActionStepResult> {
  const { co, task, agent, meta, tools, reports, depth, maxDepth, step, transcript, gate, log, taskId } =
    ctx;

  switch (action.action) {
    case "tool": {
      const tool = tools.find((t) => t.name === action.tool);
      let observation: string;
      let ok = true;
      if (!tool) {
        observation = `error: tool "${action.tool}" not available (you have: ${tools.map((t) => t.name).join(", ") || "none"})`;
        ok = false;
        await gate(() =>
          co.appendThought(agent.name, task.id, `**observation:** ${truncate(observation, 800)}`)
        );
      } else if (meta.policies?.approveTools?.includes(tool.name)) {
        const decision = findDecision(co, task.id, tool.name);
        if (!decision) {
          await gate(() => {
            requestApproval(co, agent.name, task.id, tool.name, action.args ?? {});
            task.status = "waiting";
            co.saveTask(task);
            co.appendThought(agent.name, task.id, `**parked:** awaiting owner approval for ${tool.name}`);
          });
          log(`  ⏸ ${task.id} parked — ${tool.name} needs owner approval`);
          return {
            kind: "return",
            result: { status: "worked", taskId, detail: `awaiting approval for ${tool.name}` },
          };
        }
        if (decision.status === "pending") {
          await gate(() => {
            task.status = "waiting";
            co.saveTask(task);
          });
          log(`  ⏸ ${task.id} still awaiting owner approval (${decision.id})`);
          return {
            kind: "return",
            result: { status: "worked", taskId, detail: `awaiting approval ${decision.id}` },
          };
        }
        if (decision.status === "denied") {
          await gate(() => consumeApproval(co, decision));
          transcript.push(
            `step ${step}: owner DENIED use of ${tool.name}${decision.note ? ` ("${decision.note}")` : ""} — do not try it again; work around it or complete honestly.`
          );
          return { kind: "continue" };
        }
        await gate(() => consumeApproval(co, decision));
        await gate(() => co.addSpent(0, 1));
        try {
          observation = await gate(() =>
            tool.run({ company: co, agent: agent.name, shouldStop: ctx.shouldStop }, action.args ?? {})
          );
        } catch (e) {
          observation = `error: ${(e as Error).message}`;
          ok = false;
        }
        await gate(() => {
          co.audit({
            type: `tool.${tool.name}`,
            ok,
            agent: agent.name,
            taskId: task.id,
            detail: `[owner-approved ${decision.id}] ` + truncate(JSON.stringify(action.args ?? {}), 180),
          });
          co.appendThought(agent.name, task.id, `**observation:** ${truncate(observation, 800)}`);
        });
        transcript.push(
          `step ${step}: tool ${action.tool}(${JSON.stringify(action.args ?? {})}) [owner approved] → ${truncate(observation, 1600)}`
        );
        return { kind: "continue", toolOkDelta: ok ? 1 : 0 };
      } else {
        await gate(() => co.addSpent(0, 1));
        try {
          observation = await gate(() =>
            tool.run({ company: co, agent: agent.name, shouldStop: ctx.shouldStop }, action.args ?? {})
          );
        } catch (e) {
          observation = `error: ${(e as Error).message}`;
          ok = false;
        }
        await gate(() => {
          co.audit({
            type: `tool.${tool.name}`,
            ok,
            agent: agent.name,
            taskId: task.id,
            detail: truncate(JSON.stringify(action.args ?? {}), 200),
          });
          co.appendThought(agent.name, task.id, `**observation:** ${truncate(observation, 800)}`);
        });
      }
      transcript.push(
        `step ${step}: tool ${action.tool}(${JSON.stringify(action.args ?? {})}) → ${truncate(observation!, 1600)}`
      );
      return { kind: "continue", toolOkDelta: ok ? 1 : 0 };
    }

    case "message": {
      if (action.to && co.listAgents().some((a) => a.name === action.to)) {
        await gate(() =>
          co.sendMessage(agent.name, action.to!, `note re ${task.id}`, action.content ?? "", task.id)
        );
        transcript.push(`step ${step}: sent message to ${action.to}`);
      } else {
        transcript.push(`step ${step}: error: unknown agent "${action.to}"`);
      }
      return { kind: "continue" };
    }

    case "delegate": {
      if (!reports.length) {
        transcript.push(`step ${step}: error: you have no reports; do the work yourself and complete`);
        return { kind: "continue" };
      }
      if (depth >= maxDepth) {
        transcript.push(
          `step ${step}: error: delegation depth limit reached; complete the task yourself`
        );
        return { kind: "continue" };
      }
      const subtasks = (action.subtasks ?? []).filter((s) => s.title && s.assignee);
      const valid = subtasks.filter((s) => reports.some((r) => r.name === s.assignee));
      if (!valid.length) {
        transcript.push(
          `step ${step}: error: no valid subtasks; assignees must be one of: ${reports.map((r) => r.name).join(", ")}`
        );
        return { kind: "continue" };
      }
      await gate(() => {
        for (const s of valid.slice(0, 6)) {
          const child = co.createTask({
            title: s.title,
            description: s.description || s.title,
            assignee: s.assignee,
            createdBy: agent.name,
            parent: task.id,
          });
          co.enqueue(child.id);
          co.sendMessage(
            agent.name,
            s.assignee,
            `new task ${child.id}: ${s.title}`,
            s.description || s.title,
            child.id
          );
        }
        task.status = "waiting";
        co.saveTask(task);
        co.appendThought(
          agent.name,
          task.id,
          `**delegated:** ${valid.map((s) => `${s.assignee}←"${s.title}"`).join("; ")}`
        );
      });
      log(`  ⇒ delegated ${valid.length} subtask(s), ${task.id} now waiting`);
      return {
        kind: "return",
        result: { status: "worked", taskId, detail: `delegated ${valid.length}` },
      };
    }

    case "complete": {
      await gate(() => {
        completeTask(co, task, agent.name, action.result ?? "(no result text)");
        co.appendThought(agent.name, task.id, `**completed:** ${truncate(action.result ?? "", 500)}`);
      });
      log(`  ✓ ${task.id} completed`);
      return { kind: "return", result: { status: "worked", taskId, detail: "completed" } };
    }

    default:
      transcript.push(`step ${step}: error: unknown action "${String(action.action)}"`);
      return { kind: "continue" };
  }
}
