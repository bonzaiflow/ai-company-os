import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { truncate } from "../util.js";
import type { Company } from "./store.js";

/** Everything the chief should "just know": org with live status, every task
 * with its result, the queue, budget countdown, artifacts on disk, recent
 * events. Deliberately verbose — context is cheap, ignorance is not. */
export function stateSnapshot(co: Company): string {
  const meta = co.meta;
  const tasks = co.listTasks();
  const spent = co.spent();
  const remaining = Math.max(0, meta.budget.tokens - spent.tokens);
  const queue = co.queue();
  const running = new Map(
    tasks.filter((t) => t.status === "running").map((t) => [t.assignee, t.id])
  );

  const targetLines = (meta.targets ?? []).map((t) => {
    const have = co.measure(t);
    return `- ${t.label}: ${have}/${t.count} in "${t.table}"${have >= t.count ? " ✓ MET" : ` (${t.count - have} short)`}`;
  });

  const lines: string[] = [
    `## Company state (live, complete)`,
    `Budget: ${remaining.toLocaleString()} of ${meta.budget.tokens.toLocaleString()} tokens REMAINING (${spent.tokens.toLocaleString()} spent, ${spent.toolCalls} tool calls). ` +
      (remaining === 0 ? "BUDGET EXHAUSTED — the runtime will not process tasks until the owner grants more tokens." : ""),
    ``,
    ...(targetLines.length ? [`### Goals (numeric targets)`, ...targetLines, ``] : []),
    `### Organisation`,
    ...co.listAgents().map((a) => {
      const inbox = path.join(co.agentDir(a.name), "INBOX");
      const unread = fs.existsSync(inbox)
        ? fs.readdirSync(inbox).filter((f) => f.endsWith(".md")).length
        : 0;
      return `- ${a.name} (${a.role}, ${a.rank}${a.manager ? `, reports to ${a.manager}` : ""}) — ${
        running.get(a.name) ? `WORKING on ${running.get(a.name)}` : "idle"
      }${unread ? `, ${unread} unread message(s)` : ""} | tools: ${a.tools.join(",") || "—"}`;
    }),
    ``,
    `### All tasks (${tasks.length})`,
    ...tasks.map(
      (t) =>
        `- ${t.id} [${t.status}] "${t.title}" → ${t.assignee}${t.parent ? ` (subtask of ${t.parent})` : ""}` +
        (t.result ? ` | result: ${truncate(t.result.replace(/\n/g, " "), 220)}` : "")
    ),
    ``,
    `Queue order: ${queue.join(", ") || "(empty)"}`,
    ``,
    `### Artifacts in data/`,
    ...listDataFiles(co),
    ``,
    `### Recent events`,
    ...co
      .auditTail(25)
      .map((e) => `- ${e.ts.slice(11, 19)} ${e.type}${e.taskId ? ` ${e.taskId}` : ""}${e.agent ? ` (${e.agent})` : ""} ${truncate(e.detail ?? "", 100)}`),
  ];
  return lines.join("\n");
}

function listDataFiles(co: Company): string[] {
  const dir = path.join(co.dir, "data");
  if (!fs.existsSync(dir)) return ["- (none)"];
  const out: string[] = [];
  for (const f of fs.readdirSync(dir)) {
    const st = fs.statSync(path.join(dir, f));
    if (!st.isFile()) continue;
    let extra = "";
    if (f.endsWith(".db")) {
      try {
        const db = new DatabaseSync(path.join(dir, f));
        const tables = db
          .prepare("SELECT name FROM sqlite_master WHERE type='table'")
          .all() as { name: string }[];
        extra =
          " — tables: " +
          tables
            .map((t) => {
              const n = db.prepare(`SELECT COUNT(*) AS n FROM "${t.name}"`).get() as { n: number };
              return `${t.name}(${n.n} rows)`;
            })
            .join(", ");
        db.close();
      } catch {}
    }
    out.push(`- data/${f} (${st.size} B)${extra}`);
  }
  // owner uploads — the chief must know these exist and can be imported
  const up = path.join(dir, "uploads");
  if (fs.existsSync(up)) {
    for (const f of fs.readdirSync(up)) {
      const st = fs.statSync(path.join(up, f));
      if (st.isFile()) {
        out.push(`- data/uploads/${f} (${st.size} B) — owner-uploaded; agents can import it with the importdata tool`);
      }
    }
  }
  return out.length ? out : ["- (none)"];
}

/** Resolve a chief lookup request: a file path inside the company, or
 * "sql:<dbfile>:<SELECT ...>" against a database under data/. */
export function resolveLookup(co: Company, lookup: string): string {
  const sqlMatch = /^sql:([\w.-]+):([\s\S]+)$/.exec(lookup.trim());
  if (sqlMatch) {
    const dbPath = path.resolve(co.dir, "data", sqlMatch[1]);
    if (!dbPath.startsWith(path.join(co.dir, "data"))) return "error: invalid db path";
    if (!fs.existsSync(dbPath)) return `error: no such database data/${sqlMatch[1]}`;
    if (!/^\s*select/i.test(sqlMatch[2])) return "error: only SELECT queries allowed in lookups";
    try {
      const db = new DatabaseSync(dbPath);
      const rows = db.prepare(sqlMatch[2]).all();
      db.close();
      return truncate(JSON.stringify(rows.slice(0, 40), null, 1), 4000);
    } catch (e) {
      return "error: " + (e as Error).message;
    }
  }
  const full = path.resolve(co.dir, lookup.trim());
  if (full !== co.dir && !full.startsWith(co.dir + path.sep)) return "error: path outside company";
  if (!fs.existsSync(full)) return `error: no such file ${lookup}`;
  if (!fs.statSync(full).isFile()) {
    return "directory listing:\n" + fs.readdirSync(full).join("\n");
  }
  return truncate(fs.readFileSync(full, "utf8"), 4000);
}

export function chiefChatSystem(co: Company): string {
  const chief = co.chief();
  const meta = co.meta;
  return [
    `You are ${chief?.name}, ${chief?.role} of "${meta.name}", chatting with the company owner (the user).`,
    `Company goal: ${meta.goal}`,
    ``,
    `You are the most senior agent and you KNOW your company: a complete live state snapshot follows below.`,
    `Answer from it precisely — cite task ids, file names, table names and numbers. Never invent finished work.`,
    ``,
    `THE ONE RULE: work in this company happens ONLY when you put it in createTasks. Your words start`,
    `nothing. Already-failed or already-queued tasks in the snapshot do NOT count — if the owner asks`,
    `for an outcome that is not already sitting DONE, you MUST emit fresh createTasks THIS answer, even`,
    `if similar tasks failed before (phrase them to avoid the earlier failure). Reporting the state`,
    `without creating the requested work is the #1 failure — do not do it.`,
    ``,
    `Every answer is ONE JSON object. Put "reply" FIRST so it can stream:`,
    `{"reply":"...","createTasks":[{"title":"...","description":"..."}],"lookup":""}`,
    `- reply: short, concrete, factual. Write this field before any others.`,
    `- createTasks: REQUIRED. Empty [] ONLY if the owner asked a pure question with no action.`,
    `  If the owner asks to find/extract/build/fix/get/scrape anything → 1-3 outcome-phrased tasks here.`,
    `  Each description must be self-contained and concrete (targets, columns, sources).`,
    `- setTargets (optional): when the owner names a numeric goal ("find 10000 leads", "100 firms"),`,
    `  record it as [{label, table, where?, count}] pointing at the db table that holds those rows`,
    `  (e.g. {label:"leads", table:"leads", count:10000}). This is the number the company auto-works`,
    `  toward when the queue empties. Raise it when the owner asks for more; omit if no number is set.`,
    `  Also give the matching createTasks a numeric target so workers push to the count.`,
    `- lookup (optional string, else ""): when the snapshot is not detailed enough, request exact detail instead of guessing:`,
    `    a file path, e.g. "tasks/TASK-0004.md" or "agents/Worker/workspace/TASK-0004.md" or "data/notes.md"`,
    `    or SQL, e.g. "sql:main.db:SELECT * FROM leads LIMIT 10"`,
    `  You will receive the lookup result and can then answer (max 3 lookups per question).`,
    `- If the budget is exhausted, tell the owner plainly and ask them to grant more tokens.`,
    `- Output ONLY the JSON object — no prose before or after it.`,
    ``,
    stateSnapshot(co),
  ].join("\n");
}
