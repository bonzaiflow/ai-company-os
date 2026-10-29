import crypto from "node:crypto";
import type { AgentSpec } from "../types.js";
import { isLeased } from "./agent-runtime.js";
import { renderBrief } from "./brief.js";
import {
  claimNext,
  delegateHeld,
  failHeld,
  finishTask,
  heartbeat,
  heldTask,
  releaseTask,
  WorkError,
} from "./lease.js";
import type { Company } from "./store.js";
import { messageAgent, type SubtaskSpec } from "./work.js";

/** One dispatcher for the work contract over the network (HTTP routes and
 * remote MCP). The caller is already authenticated as `agent`; every task
 * action additionally checks the task belongs to that agent. */

export const WORK_ACTIONS = ["next", "brief", "heartbeat", "done", "fail", "delegate", "release", "message", "inbox"] as const;
export type WorkAction = (typeof WORK_ACTIONS)[number];

export type WorkReply = { status: number; body: Record<string, unknown> };

const MIN_TOKEN_LENGTH = 24;
const MAX_WAIT_SECONDS = 60;

/** The external/manual agent whose `tokenEnv` holds this bearer token. */
export function agentForToken(co: Company, token: string): AgentSpec | null {
  if (!token) return null;
  const want = crypto.createHash("sha256").update(token).digest();
  for (const a of co.listAgents()) {
    if (!a.tokenEnv || !isLeased(a)) continue;
    const secret = process.env[a.tokenEnv];
    if (!secret || secret.length < MIN_TOKEN_LENGTH) continue;
    const have = crypto.createHash("sha256").update(secret).digest();
    if (crypto.timingSafeEqual(want, have)) return a;
  }
  return null;
}

const STATUS: Record<WorkError["kind"], number> = { input: 400, lease: 409, blocked: 423 };

function str(v: unknown, name: string): string {
  if (typeof v !== "string" || !v.trim()) throw new WorkError(`missing "${name}"`, "input");
  return v;
}

/** The task must be this agent's — a token for one agent never touches another's work. */
function own(co: Company, agent: string, taskId: string, leaseId: string) {
  const task = heldTask(co, taskId, leaseId);
  if (task.assignee !== agent) throw new WorkError(`${taskId} belongs to ${task.assignee}`, "lease");
  return task;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function workCall(
  co: Company,
  agent: string,
  action: WorkAction,
  p: Record<string, unknown>
): Promise<WorkReply> {
  try {
    switch (action) {
      case "next": {
        const wait = Math.min(MAX_WAIT_SECONDS, Math.max(0, Number(p.wait ?? 0) || 0));
        const deadline = Date.now() + wait * 1000;
        for (;;) {
          const claim = claimNext(co, agent);
          if (claim) {
            const brief = renderBrief(co, claim.task, co.loadAgent(agent), claim.lease);
            return {
              status: 200,
              body: { ok: true, resumed: claim.resumed, task: { id: claim.task.id, title: claim.task.title }, lease: claim.lease, brief },
            };
          }
          if (Date.now() >= deadline) return { status: 200, body: { ok: true, idle: true, agent } };
          await sleep(2000);
        }
      }
      case "brief": {
        const task = own(co, agent, str(p.taskId, "taskId"), str(p.lease, "lease"));
        return { status: 200, body: { ok: true, taskId: task.id, brief: renderBrief(co, task, co.loadAgent(agent), task.lease!) } };
      }
      case "heartbeat": {
        const taskId = str(p.taskId, "taskId");
        own(co, agent, taskId, str(p.lease, "lease"));
        return { status: 200, body: { ok: true, taskId, lease: heartbeat(co, taskId, String(p.lease)) } };
      }
      case "done": {
        const taskId = str(p.taskId, "taskId");
        own(co, agent, taskId, str(p.lease, "lease"));
        const tokens = Number(p.tokens) > 0 ? Number(p.tokens) : undefined;
        const o = finishTask(co, taskId, String(p.lease), str(p.result, "result"), { tokens, via: "remote" });
        return {
          status: 200,
          body: o.status === "review" ? { ok: true, taskId, status: "review", approval: o.approval.id } : { ok: true, taskId, status: o.status },
        };
      }
      case "fail": {
        const taskId = str(p.taskId, "taskId");
        own(co, agent, taskId, str(p.lease, "lease"));
        const t = failHeld(co, taskId, String(p.lease), str(p.reason, "reason"), p.retry !== false);
        return { status: 200, body: { ok: true, taskId, status: t.status } };
      }
      case "delegate": {
        const taskId = str(p.taskId, "taskId");
        own(co, agent, taskId, str(p.lease, "lease"));
        if (!Array.isArray(p.subtasks)) throw new WorkError(`"subtasks" must be an array`, "input");
        const o = delegateHeld(co, taskId, String(p.lease), p.subtasks as SubtaskSpec[]);
        const created = o.ok ? o.created.map((t) => ({ id: t.id, title: t.title, assignee: t.assignee })) : [];
        return { status: 200, body: { ok: true, taskId, status: "waiting", created } };
      }
      case "release": {
        const taskId = str(p.taskId, "taskId");
        own(co, agent, taskId, str(p.lease, "lease"));
        releaseTask(co, taskId, String(p.lease), typeof p.reason === "string" ? p.reason : "released (remote)");
        return { status: 200, body: { ok: true, taskId, status: "queued" } };
      }
      case "message": {
        const sent = messageAgent(co, agent, str(p.to, "to"), str(p.text, "text"), typeof p.taskId === "string" ? p.taskId : undefined);
        if (!sent.ok) throw new WorkError(sent.error, "input");
        return { status: 200, body: { ok: true, from: agent, to: p.to } };
      }
      case "inbox":
        return { status: 200, body: { ok: true, agent, messages: co.peekInbox(agent) } };
    }
  } catch (e) {
    if (e instanceof WorkError) return { status: STATUS[e.kind], body: { ok: false, error: e.message, kind: e.kind } };
    throw e;
  }
}
