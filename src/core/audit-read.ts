import fs from "node:fs";
import path from "node:path";
import type { AuditEvent } from "../types.js";
import type { Company } from "./store.js";

/** Audit events for one task id (newest last). */
export function taskAudit(co: Company, id: string, limit = 200): AuditEvent[] {
  const file = path.join(co.dir, "audit.jsonl");
  if (!fs.existsSync(file)) return [];
  const out: AuditEvent[] = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as AuditEvent;
      if (e.taskId === id) out.push(e);
    } catch {
      /* skip bad lines */
    }
  }
  return limit > 0 ? out.slice(-limit) : out;
}
