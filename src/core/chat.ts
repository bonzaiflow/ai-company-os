import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { streamChat } from "../llm/index.js";
import { resolveProvider } from "../llm/resolve.js";
import type { ChatMessage, AiCompanyOsConfig, Task } from "../types.js";
import { extractJson, extractPartialJsonField, nowIso, truncate } from "../util.js";
import type { Company } from "./store.js";

const CHAT_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    createTasks: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, description: { type: "string" } },
        required: ["title", "description"],
        additionalProperties: false,
      },
    },
    lookup: { type: "string" },
    setTargets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          table: { type: "string" },
          where: { type: "string" },
          count: { type: "number" },
        },
        required: ["label", "table", "count"],
        additionalProperties: false,
      },
    },
  },
  required: ["reply", "createTasks"],
} as const;

/** The chief "promising" work in prose while returning an empty createTasks
 * is a lie the engine must catch — work only starts through createTasks.
 * Two nets: the reply promising action (incl. German passive constructions),
 * and — more reliably — the OWNER's message being request-shaped. */
const ACTION_PROMISE =
  /\b(ich (starte|beginne|werde)|starte (die|jetzt|mit|ich)|lege los|wird (jetzt|neu|gestartet|aufgesetzt|angestoßen)|werden (jetzt|neu)|nehme .{0,20}in angriff|I('ll| will| am going to| start)|starting (the|to|now)|kicking off|will (now )?(start|begin|create))/i;

const WORK_REQUEST =
  /\b(bitte|please|finde|find|such|extrahier|extract|erstell|create|build|bau|scrape|besorg|mach|do this|get me|need|brauche|will haben|können sie|kannst du|can you|could you|add|füge|starte|run|führe)/i;

export type ChiefChatEvent =
  | { type: "status"; label: string }
  | { type: "reasoning"; text: string }
  | { type: "delta"; text: string }
  | { type: "lookup"; path: string }
  | {
      type: "done";
      reply: string;
      reasoning?: string;
      created: { id: string; title: string }[];
      lookups: string[];
    }
  | { type: "error"; error: string };

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
function resolveLookup(co: Company, lookup: string): string {
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

function chiefChatSystem(co: Company): string {
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

interface ChatReply {
  reply?: string;
  createTasks?: { title: string; description: string }[];
  lookup?: string;
  setTargets?: { label: string; table: string; where?: string; count: number }[];
}

export async function* chiefChatStream(
  co: Company,
  cfg: AiCompanyOsConfig,
  history: ChatMessage[],
  message: string
): AsyncGenerator<ChiefChatEvent> {
  const chief = co.chief();
  if (!chief) {
    yield { type: "error", error: "company has no chief agent" };
    return;
  }
  const meta = co.meta;
  const provider = resolveProvider(cfg, {
    role: "agents",
    meta,
    agent: chief,
  });

  const messages: ChatMessage[] = [
    { role: "system", content: chiefChatSystem(co) },
    ...history.slice(-12),
    { role: "user", content: message },
  ];

  const lookups: string[] = [];
  let promiseChecked = false;
  let parsed: ChatReply | null = null;
  let lastReasoning = "";

  try {
    for (let round = 0; round < 4; round++) {
      let lastErr = "";
      parsed = null;
      let raw = "";
      let reasoning = "";
      let emittedReply = "";
      let promptTokens = 0;
      let completionTokens = 0;

      yield {
        type: "status",
        label: round === 0 ? "Composing reply…" : "Looking up details…",
      };

      for (let attempt = 0; attempt < 3 && !parsed; attempt++) {
        try {
          raw = "";
          reasoning = "";
          emittedReply = "";
          promptTokens = 0;
          completionTokens = 0;
          // No JSON-schema grammar during streaming — Ollama/OpenRouter often
          // buffer the entire constrained object and emit it in one shot.
          // The system prompt already requires JSON; we parse it at the end.
          for await (const chunk of streamChat(provider, messages, {
            temperature: 0.4,
          })) {
            if (chunk.reasoning) {
              reasoning += chunk.reasoning;
              yield { type: "reasoning", text: chunk.reasoning };
            }
            if (chunk.content) {
              raw += chunk.content;
              const partial = extractPartialJsonField(raw, "reply");
              if (partial != null && partial.length > emittedReply.length) {
                const delta = partial.slice(emittedReply.length);
                emittedReply = partial;
                if (delta) yield { type: "delta", text: delta };
              }
            }
            if (chunk.promptTokens != null) promptTokens = chunk.promptTokens;
            if (chunk.completionTokens != null) completionTokens = chunk.completionTokens;
          }
          co.addSpent(promptTokens + completionTokens, 0, chief.name);
          parsed = extractJson(raw) as ChatReply;
          lastReasoning = reasoning;
        } catch (e) {
          lastErr = (e as Error).message;
        }
      }
      if (!parsed) {
        yield { type: "error", error: `chief chat failed: ${lastErr}` };
        return;
      }

      // model wants to look something up before answering
      if (parsed.lookup && round < 3) {
        const result = resolveLookup(co, parsed.lookup);
        lookups.push(parsed.lookup);
        yield { type: "lookup", path: parsed.lookup };
        co.audit({
          type: "chat.lookup",
          ok: !result.startsWith("error:"),
          agent: chief.name,
          detail: truncate(parsed.lookup, 120),
        });
        messages.push({ role: "assistant", content: JSON.stringify({ lookup: parsed.lookup }) });
        messages.push({
          role: "user",
          content: `LOOKUP RESULT for "${parsed.lookup}":\n${result}\n\nNow answer the original question.`,
        });
        continue;
      }

      // accountability: reply promises action but createTasks is empty →
      // one corrective round forcing the model to put up or back down
      if (
        round < 3 &&
        !promiseChecked &&
        !(parsed.createTasks ?? []).length &&
        (ACTION_PROMISE.test(parsed.reply ?? "") || WORK_REQUEST.test(message))
      ) {
        promiseChecked = true;
        co.audit({
          type: "chat.promise-check",
          ok: false,
          agent: chief.name,
          detail: "reply promised work with empty createTasks — forcing correction",
        });
        yield { type: "status", label: "creating the promised tasks" };
        messages.push({ role: "assistant", content: JSON.stringify(parsed) });
        messages.push({
          role: "user",
          content:
            "STOP. createTasks was empty but the owner requested work. Nothing has been created — your " +
            "previous answer did literally nothing. Reply AGAIN with the same JSON shape and this time " +
            "createTasks MUST contain 1-3 concrete task objects {title, description} that fulfill the " +
            "owner's request (e.g. scout raw leads, extract & verify emails, QA + export). Existing " +
            "failed tasks do not count. Output ONLY the JSON object.",
        });
        continue;
      }
      break;
    }

    // persist / raise the company's numeric goals (drives auto-replan on drain)
    const setTargets = (parsed?.setTargets ?? []).filter((t) => t.label && t.table && t.count > 0);
    if (setTargets.length) {
      const existing = co.meta.targets ?? [];
      for (const nt of setTargets) {
        const cur = existing.find((e) => e.label === nt.label);
        if (cur) {
          cur.count = Math.max(cur.count, nt.count);
          cur.table = nt.table;
          cur.where = nt.where;
        } else existing.push(nt);
      }
      co.saveMeta({ targets: existing });
      co.audit({
        type: "target.set",
        ok: true,
        agent: chief.name,
        detail: existing.map((t) => `${t.label}=${t.count}`).join(", "),
      });
    }

    const created: Task[] = [];
    for (const t of (parsed?.createTasks ?? []).slice(0, 3)) {
      if (!t.title) continue;
      // if a company target's table name appears in the task, bind it so the
      // engine drives this task to the number
      const tgt = (co.meta.targets ?? []).find(
        (g) => new RegExp("\\b" + g.table + "\\b", "i").test(t.title + " " + (t.description || ""))
      );
      const task = co.createTask({
        title: t.title,
        description: t.description || t.title,
        assignee: chief.name,
        createdBy: "user (via chat)",
        target: tgt ? { metric: "rows", table: tgt.table, db: tgt.db, where: tgt.where, count: tgt.count } : undefined,
      });
      co.enqueue(task.id);
      created.push(task);
    }

    const reply = parsed?.reply ?? "";
    co.audit({
      type: "chat.message",
      ok: true,
      agent: chief.name,
      detail:
        truncate(`user: ${message} | ${chief.name}: ${reply}`, 200) +
        (created.length ? ` | created ${created.map((t) => t.id).join(",")}` : ""),
    });

    fs.appendFileSync(
      path.join(co.agentDir(chief.name), "CHAT.md"),
      `\n**user** (${nowIso()}):\n${message}\n\n**${chief.name}**:\n${reply}\n` +
        (lastReasoning ? `\n_reasoning:_\n${truncate(lastReasoning, 2000)}\n` : "") +
        (lookups.length ? `\n_looked up: ${lookups.join(", ")}_\n` : "") +
        (created.length ? `\n_created: ${created.map((t) => `${t.id} "${t.title}"`).join(", ")}_\n` : "")
    );

    yield {
      type: "done",
      reply,
      reasoning: lastReasoning || undefined,
      created: created.map((t) => ({ id: t.id, title: t.title })),
      lookups,
    };
  } catch (e) {
    yield { type: "error", error: (e as Error).message };
  }
}

/** Auto-replan: when the queue drains, the chief compares the live state and
 * the company's numeric targets to the goal, and (if there's an unmet target
 * still worth chasing) emits fresh tasks — including recycled versions of
 * tasks that stalled, re-scoped with what's now known (current count, which
 * sources/regions produced rows, remaining delta). Returns the tasks it made.
 * Reuses the same accountable createTasks path as the chat. */
export async function chiefReplan(co: Company, cfg: AiCompanyOsConfig): Promise<Task[]> {
  const meta = co.meta;
  const targets = meta.targets ?? [];
  const unmet = targets
    .map((t) => ({ t, have: co.measure(t) }))
    .filter((x) => x.have < x.t.count);
  if (!targets.length || !unmet.length) return []; // nothing to chase

  const gaps = unmet
    .map((x) => `- ${x.t.label}: ${x.have}/${x.t.count} in table "${x.t.table}" (need ${x.t.count - x.have} more)`)
    .join("\n");

  const msg =
    `The queue is empty but these company targets are NOT yet met:\n${gaps}\n\n` +
    `Evaluate the delta to the goal and create the tasks needed to close it. ` +
    `Recycle what stalled before, re-scoped with what you now know (current counts, which ` +
    `sources/regions/segments already produced rows, the remaining delta) so workers push into NEW ` +
    `territory instead of repeating exhausted searches. Give count-bearing tasks a concrete numeric target.`;

  const out = await chiefChat(co, cfg, [], msg);
  if (out.created.length) {
    co.audit({
      type: "replan.created",
      ok: true,
      agent: co.chief()?.name,
      detail: `${out.created.map((t) => t.id).join(",")} to close: ${gaps.replace(/\n/g, " | ")}`,
    });
  }
  return out.created;
}

export async function chiefChat(
  co: Company,
  cfg: AiCompanyOsConfig,
  history: ChatMessage[],
  message: string
): Promise<{ reply: string; created: Task[]; lookups: string[]; reasoning?: string }> {
  let reply = "";
  let reasoning: string | undefined;
  let created: Task[] = [];
  let lookups: string[] = [];
  for await (const evt of chiefChatStream(co, cfg, history, message)) {
    if (evt.type === "done") {
      reply = evt.reply;
      reasoning = evt.reasoning;
      created = evt.created.map((t) => co.loadTask(t.id));
      lookups = evt.lookups;
    } else if (evt.type === "error") {
      throw new Error(evt.error);
    }
  }
  return { reply, created, lookups, reasoning };
}
