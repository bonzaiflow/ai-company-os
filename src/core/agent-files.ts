import fs from "node:fs";
import path from "node:path";
import type { Company } from "./store.js";

/** List INBOX/OUTBOX/workspace (+ CHAT.md) files under an agent directory. */
export function listAgentFiles(co: Company, agent: string): { path: string; size: number }[] {
  const out: { path: string; size: number }[] = [];
  const base = co.agentDir(agent);
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else out.push({ path: path.relative(co.dir, full), size: fs.statSync(full).size });
    }
  };
  for (const sub of ["INBOX", "OUTBOX", "workspace"]) walk(path.join(base, sub));
  if (fs.existsSync(path.join(base, "CHAT.md"))) {
    out.push({
      path: path.relative(co.dir, path.join(base, "CHAT.md")),
      size: fs.statSync(path.join(base, "CHAT.md")).size,
    });
  }
  return out;
}

/** Cheap fingerprint of on-disk company data (sqlite + wal/shm) so the UI
 * can pulse the Data button when something new lands. */
export function companyDataSig(co: Company): string {
  const dir = path.join(co.dir, "data");
  if (!fs.existsSync(dir)) return "";
  const parts: string[] = [];
  for (const f of fs.readdirSync(dir).sort()) {
    if (!/\.(db|sqlite|sqlite3)(-wal|-shm)?$/i.test(f)) continue;
    try {
      const st = fs.statSync(path.join(dir, f));
      parts.push(`${f}:${st.size}:${Math.floor(st.mtimeMs)}`);
    } catch {
      /* ignore transient files */
    }
  }
  return parts.join("|");
}
