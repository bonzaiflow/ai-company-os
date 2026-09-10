import fs from "node:fs";
import path from "node:path";
import { streamChat } from "../llm/index.js";
import { resolveProvider } from "../llm/resolve.js";
import type { ChatMessage, AiCompanyOsConfig, Task } from "../types.js";
import { extractJson, extractPartialJsonField, nowIso, truncate } from "../util.js";
import type { Company } from "./store.js";
import { chiefChatSystem, resolveLookup } from "./chat-state.js";

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
