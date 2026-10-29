import path from "node:path";
import { truncate } from "../../util.js";
import { readyCandidates } from "../queue.js";
import type { Company } from "../store.js";
import { loadState, saveState } from "./state.js";
import { telegramToken, tgSendMessage, type InlineKeyboard } from "./telegram-api.js";

export type OwnerNudgeKind = "queue_empty" | "replan" | "stall" | "approvals" | "manual";

const DEBOUNCE_MS: Record<OwnerNudgeKind, number> = {
  queue_empty: 30 * 60_000,
  replan: 10 * 60_000,
  stall: 15 * 60_000,
  approvals: 20 * 60_000,
  manual: 0, // one note per task, deduped by task id instead
};

function nudgeKeyboard(paused: boolean): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "Status", callback_data: "t:s" },
        { text: "Queue", callback_data: "t:q" },
      ],
      [
        { text: "Run", callback_data: "t:r" },
        { text: paused ? "Resume" : "Pause", callback_data: "t:p" },
      ],
      [{ text: "Menu", callback_data: "t:m" }],
    ],
  };
}

/** Push a short owner-facing Telegram note when the connector is configured
 * with allowedChatIds. Debounced per kind via connectors-state.json. */
export async function notifyOwner(
  co: Company,
  kind: OwnerNudgeKind,
  text: string,
  opts: { force?: boolean } = {}
): Promise<boolean> {
  const tg = co.meta.connectors?.telegram;
  if (!tg) return false;
  const chats = (tg.allowedChatIds ?? []).map(String).filter(Boolean);
  if (!chats.length) return false;

  let token: string;
  try {
    token = telegramToken(tg);
  } catch {
    return false;
  }

  const st = loadState(co);
  const tgSt = st.telegram ?? {};
  const lastAt = tgSt.lastNudgeAt;
  const lastKind = tgSt.lastNudgeKind;
  if (!opts.force && lastAt && lastKind === kind) {
    const age = Date.now() - Date.parse(lastAt);
    if (isFinite(age) && age < DEBOUNCE_MS[kind]) return false;
  }

  const body = text.slice(0, 3900);
  let sent = 0;
  for (const chatId of chats) {
    try {
      await tgSendMessage(token, {
        chatId,
        text: body,
        replyMarkup: nudgeKeyboard(!!co.meta.paused),
      });
      sent++;
    } catch {
      /* skip bad chat */
    }
  }
  if (!sent) return false;

  saveState(co, {
    ...st,
    telegram: {
      ...tgSt,
      lastNudgeAt: new Date().toISOString(),
      lastNudgeKind: kind,
    },
  });
  co.audit({
    type: "telegram.nudge",
    ok: true,
    detail: `${kind} → ${sent} chat(s)`,
  });
  return true;
}

export function queueEmptyNudgeText(co: Company): string {
  const goal = (co.meta.goal || "").trim();
  const targets = co.meta.targets ?? [];
  const lines = [
    `📭 ${co.meta.name}: queue empty`,
    goal ? `Goal: ${goal.slice(0, 240)}` : null,
    targets.length
      ? `Targets: ${targets.map((t) => `${t.label} ${co.measure(t)}/${t.count}`).join(", ")}`
      : "No numeric targets set.",
    "",
    "Suggested next steps:",
    "• Chat the chief with a new goal or raise targets",
    "• Run Check-ins for a stats snapshot",
    "• Review Data / Approvals, then Run again",
  ];
  return lines.filter((x) => x != null).join("\n");
}

export function replanNudgeText(co: Company, createdIds: string[]): string {
  const unmet = (co.meta.targets ?? [])
    .map((t) => `${t.label} ${co.measure(t)}/${t.count}`)
    .join(", ");
  return [
    `↻ ${co.meta.name}: chief replanning`,
    unmet ? `Toward: ${unmet}` : "Toward company goal",
    createdIds.length
      ? `Queued: ${createdIds.slice(0, 8).join(", ")}${createdIds.length > 8 ? "…" : ""}`
      : "Replan produced no new tasks yet — continuing.",
  ].join("\n");
}

export function stallNudgeText(co: Company, detail: string): string {
  return [
    `⚠️ ${co.meta.name}: needs owner input`,
    detail.slice(0, 500),
    "",
    "Ideas: broaden the goal, grant budget, clear blockers, or chat the chief to replan.",
  ].join("\n");
}

/** Tell the owner about new ready tasks of manual agents (a human or a chat
 * window) — once per task. Returns how many notes went out. */
export async function notifyManualWork(co: Company): Promise<number> {
  if (!co.meta.connectors?.telegram) return 0;
  const manual = new Set(co.listAgents().filter((a) => a.runtime === "manual").map((a) => a.name));
  if (!manual.size) return 0;
  const seen = new Set(loadState(co).manualNotified ?? []);
  const fresh = readyCandidates(co).filter((t) => manual.has(t.assignee) && !seen.has(t.id));
  let sent = 0;
  for (const t of fresh) {
    if (await notifyOwner(co, "manual", manualWorkText(co, t), { force: true })) sent++;
    seen.add(t.id);
  }
  if (fresh.length) {
    const st = loadState(co);
    saveState(co, { ...st, manualNotified: [...seen].slice(-500) });
  }
  return sent;
}

function manualWorkText(co: Company, t: { id: string; title: string; assignee: string; description: string }): string {
  return [
    `📝 ${co.meta.name}: task for ${t.assignee}`,
    `${t.id} ${t.title}`,
    truncate(t.description, 600),
    "",
    `Brief: ai-company-os work next -c ${path.basename(co.dir)} --as ${t.assignee}`,
    "Then report with `work done`, or enter the result in the dashboard task view.",
  ].join("\n");
}
