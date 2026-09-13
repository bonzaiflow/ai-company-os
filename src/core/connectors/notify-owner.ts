import type { Company } from "../store.js";
import { loadState, saveState } from "./state.js";
import { telegramToken, tgSendMessage, type InlineKeyboard } from "./telegram-api.js";

export type OwnerNudgeKind = "queue_empty" | "replan" | "stall" | "approvals";

const DEBOUNCE_MS: Record<OwnerNudgeKind, number> = {
  queue_empty: 30 * 60_000,
  replan: 10 * 60_000,
  stall: 15 * 60_000,
  approvals: 20 * 60_000,
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
