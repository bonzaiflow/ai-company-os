import crypto from "node:crypto";
import path from "node:path";
import type { AgentSpec, Task, TaskLease } from "../types.js";
import { readJson, writeJson } from "../util.js";
import type { Company } from "./store.js";

/** Who drives which agent — shared by the queue (what the engine may claim)
 * and the external work API (what an outside agent may claim). */

export const DEFAULT_LEASE_MINUTES = 30;
export const MANUAL_LEASE_MINUTES = 24 * 60;

export function runtimeOf(agent: AgentSpec): NonNullable<AgentSpec["runtime"]> {
  return agent.runtime ?? "internal";
}

/** The agent works outside the tick engine and holds tasks by lease. */
export function isLeased(agent: AgentSpec): boolean {
  return runtimeOf(agent) !== "internal";
}

/** The engine (tick / run / daemon) starts work for this agent itself:
 * internal agents, and external agents with a push adapter. */
export function engineRuns(agent: AgentSpec): boolean {
  const rt = runtimeOf(agent);
  return rt === "internal" || (rt === "external" && !!agent.adapter);
}

export function leaseMinutesFor(agent: AgentSpec): number {
  const base =
    agent.leaseMinutes ?? (runtimeOf(agent) === "manual" ? MANUAL_LEASE_MINUTES : DEFAULT_LEASE_MINUTES);
  return agent.maxMinutesPerTask ? Math.min(base, agent.maxMinutesPerTask) : base;
}

export function newLease(agent: AgentSpec, via: TaskLease["via"], pid?: number): TaskLease {
  const now = Date.now();
  return {
    id: crypto.randomBytes(6).toString("hex"),
    holder: agent.name,
    via,
    claimedAt: new Date(now).toISOString(),
    until: new Date(now + leaseMinutesFor(agent) * 60_000).toISOString(),
    ...(pid ? { pid } : {}),
  };
}

export function leaseExpired(lease: TaskLease, now = Date.now()): boolean {
  return Date.parse(lease.until) <= now;
}

/** Agent specs by name, loaded once per call site (profiles are small files). */
export function agentIndex(co: Company): Map<string, AgentSpec> {
  return new Map(co.listAgents().map((a) => [a.name, a]));
}

function usageFile(co: Company, agent: string): string {
  return path.join(co.agentDir(agent), "usage.json");
}

/** Tasks claimed today (UTC day) — backs maxTasksPerDay. */
export function claimsToday(co: Company, agent: string): number {
  const u = readJson<{ day?: string; claims?: number }>(usageFile(co, agent), {});
  return u.day === new Date().toISOString().slice(0, 10) ? (u.claims ?? 0) : 0;
}

export function countClaim(co: Company, agent: string): void {
  const day = new Date().toISOString().slice(0, 10);
  writeJson(usageFile(co, agent), { day, claims: claimsToday(co, agent) + 1 });
}

export function overDailyLimit(co: Company, agent: AgentSpec): boolean {
  return !!agent.maxTasksPerDay && claimsToday(co, agent.name) >= agent.maxTasksPerDay;
}

/** Clear a task's lease and book the time it was held to the holder. */
export function endLease(co: Company, task: Task): void {
  const lease = task.lease;
  if (!lease) return;
  task.lease = undefined;
  co.addMinutes(lease.holder, (Date.now() - Date.parse(lease.claimedAt)) / 60_000);
}
