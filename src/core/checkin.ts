import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AiCompanyOsConfig } from "../types.js";
import { ensureDir, nowIso, parseFrontmatter, serializeFrontmatter } from "../util.js";
import { listApprovals } from "./governance.js";
import type { Company } from "./store.js";

export interface CheckinStats {
  budget: { remaining: number; total: number; spent: number; toolCalls: number; pctLeft: number };
  tasks: {
    total: number;
    queued: number;
    running: number;
    waiting: number;
    done: number;
    failed: number;
  };
  queue: number;
  agents: {
    name: string;
    rank: string;
    status: "working" | "idle";
    taskId?: string;
    unread: number;
  }[];
  targets: { label: string; have: number; count: number; pct: number }[];
  databases: { file: string; tables: { name: string; rows: number }[] }[];
  uploads: { name: string; bytes: number }[];
  pendingApprovals: number;
  paused: boolean;
}

export interface Checkin {
  ts: string;
  report: string;
  questions: string[];
  needs: string[];
  stats: CheckinStats | null;
  file: string;
}

/** Deterministic company snapshot for the owner — numbers only, no LLM prose. */
export function captureCheckinStats(co: Company): CheckinStats {
  const meta = co.meta;
  const tasks = co.listTasks();
  const spent = co.spent();
  const remaining = Math.max(0, meta.budget.tokens - spent.tokens);
  const total = meta.budget.tokens;
  const byStatus = { queued: 0, running: 0, waiting: 0, done: 0, failed: 0 };
  for (const t of tasks) {
    if (t.status in byStatus) byStatus[t.status as keyof typeof byStatus]++;
  }
  const running = new Map(
    tasks.filter((t) => t.status === "running").map((t) => [t.assignee, t.id])
  );

  const agents = co.listAgents().map((a) => {
    const inbox = path.join(co.agentDir(a.name), "INBOX");
    const unread = fs.existsSync(inbox)
      ? fs.readdirSync(inbox).filter((f) => f.endsWith(".md")).length
      : 0;
    const taskId = running.get(a.name);
    return {
      name: a.name,
      rank: a.rank,
      status: (taskId ? "working" : "idle") as "working" | "idle",
      taskId,
      unread,
    };
  });

  const targets = (meta.targets ?? []).map((t) => {
    const have = co.measure(t);
    return {
      label: t.label,
      have,
      count: t.count,
      pct: t.count > 0 ? Math.min(100, Math.round((have / t.count) * 100)) : 0,
    };
  });

  return {
    budget: {
      remaining,
      total,
      spent: spent.tokens,
      toolCalls: spent.toolCalls,
      pctLeft: total > 0 ? Math.round((remaining / total) * 100) : 0,
    },
    tasks: { total: tasks.length, ...byStatus },
    queue: co.queue().length,
    agents,
    targets,
    databases: listDbStats(co),
    uploads: listUploadStats(co),
    pendingApprovals: listApprovals(co, "pending").length,
    paused: !!meta.paused,
  };
}

function listDbStats(co: Company): CheckinStats["databases"] {
  const dir = path.join(co.dir, "data");
  if (!fs.existsSync(dir)) return [];
  const out: CheckinStats["databases"] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!/\.(db|sqlite|sqlite3)$/i.test(f)) continue;
    const full = path.join(dir, f);
    if (!fs.statSync(full).isFile()) continue;
    try {
      const db = new DatabaseSync(full, { readOnly: true });
      const tables = (
        db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as {
          name: string;
        }[]
      ).map((t) => {
        const n = db.prepare(`SELECT COUNT(*) AS n FROM "${t.name}"`).get() as { n: number };
        return { name: t.name, rows: n.n };
      });
      db.close();
      out.push({ file: f, tables });
    } catch {
      out.push({ file: f, tables: [] });
    }
  }
  return out;
}

function listUploadStats(co: Company): CheckinStats["uploads"] {
  const up = path.join(co.dir, "data", "uploads");
  if (!fs.existsSync(up)) return [];
  return fs
    .readdirSync(up)
    .filter((f) => fs.statSync(path.join(up, f)).isFile())
    .map((f) => ({ name: f, bytes: fs.statSync(path.join(up, f)).size }));
}

function parseStatsBlock(body: string): CheckinStats | null {
  const m = body.match(/```json\s*([\s\S]*?)```/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as CheckinStats;
  } catch {
    return null;
  }
}

/** Snapshot company stats for the owner. No LLM — pure numbers from live state. */
export async function runCheckin(co: Company, _cfg?: AiCompanyOsConfig): Promise<Checkin> {
  const chief = co.chief();
  if (!chief) throw new Error("company has no chief agent");
  const meta = co.meta;
  const stats = captureCheckinStats(co);
  const ts = nowIso();
  const dir = path.join(co.dir, "checkins");
  ensureDir(dir);
  const file = path.join(dir, `${ts.replace(/[:.]/g, "-")}.md`);

  const alerts: string[] = [];
  if (stats.paused) alerts.push("Company is paused");
  if (stats.budget.pctLeft <= 5) alerts.push("Budget nearly exhausted");
  if (stats.pendingApprovals) alerts.push(`${stats.pendingApprovals} approval(s) waiting`);
  if (stats.tasks.failed) alerts.push(`${stats.tasks.failed} failed task(s)`);

  fs.writeFileSync(
    file,
    serializeFrontmatter(
      {
        ts,
        chief: chief.name,
        kind: "stats",
        questions: "0",
        needs: "0",
      },
      (alerts.length ? alerts.map((a) => `- ${a}`).join("\n") + "\n\n" : "") +
        "```json\n" +
        JSON.stringify(stats, null, 2) +
        "\n```\n"
    )
  );
  co.saveMeta({ checkins: { ...(meta.checkins ?? { everyHours: 24 }), lastAt: ts } });
  co.audit({
    type: "checkin.created",
    ok: true,
    agent: chief.name,
    detail: `stats snapshot · tasks ${stats.tasks.total} · budget ${stats.budget.pctLeft}% left`,
  });
  return { ts, report: "", questions: [], needs: [], stats, file };
}

export function listCheckins(co: Company): Checkin[] {
  const dir = path.join(co.dir, "checkins");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const { meta, body } = parseFrontmatter(fs.readFileSync(path.join(dir, f), "utf8"));
      const stats = parseStatsBlock(body);
      const questions = (body.match(/## Questions for you\n([\s\S]*?)(\n##|$)/)?.[1] ?? "")
        .split("\n")
        .filter((l) => l.startsWith("- "))
        .map((l) => l.slice(2));
      const needs = (body.match(/## Needs\n([\s\S]*?)(\n##|$)/)?.[1] ?? "")
        .split("\n")
        .filter((l) => l.startsWith("- "))
        .map((l) => l.slice(2));
      // strip json / legacy sections from report display
      const report = body
        .replace(/```json[\s\S]*?```/g, "")
        .replace(/## Questions for you[\s\S]*$/m, "")
        .replace(/## Needs[\s\S]*$/m, "")
        .replace(/^# Check-in[^\n]*\n+/m, "")
        .trim();
      return {
        ts: meta.ts ?? f,
        report,
        questions,
        needs,
        stats,
        file: path.join("checkins", f),
      };
    });
}
