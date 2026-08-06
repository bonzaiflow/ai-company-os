import type { TelegramConnectorConfig } from "../../types.js";
import { truncate } from "../../util.js";
import type { Company } from "../store.js";
import { ingestInbound } from "./ingest.js";
import { envSecret, loadState, saveState } from "./state.js";
import type { InboundEvent } from "./types.js";

function apiBase(token: string): string {
  return `https://api.telegram.org/bot${token}`;
}

interface TgUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    caption?: string;
    chat: { id: number; type: string; title?: string; username?: string; first_name?: string };
    from?: { id: number; username?: string; first_name?: string };
  };
}

async function tgCall<T>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${apiBase(token)}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(25_000),
  });
  const data = (await res.json()) as { ok: boolean; description?: string; result: T };
  if (!data.ok) throw new Error(`telegram ${method}: ${data.description ?? res.status}`);
  return data.result;
}

export async function sendTelegram(
  cfg: TelegramConnectorConfig,
  opts: { chatId: string; text: string }
): Promise<string> {
  const token = envSecret(cfg.botTokenEnv, "telegram");
  const chatId = String(opts.chatId ?? "").trim();
  if (!chatId) throw new Error("telegram: chatId is required");
  const text = String(opts.text ?? "").trim();
  if (!text) throw new Error("telegram: text is required");

  const allowed = cfg.allowedChatIds?.map(String).filter(Boolean) ?? [];
  if (allowed.length && !allowed.includes(chatId)) {
    throw new Error(`telegram: chatId ${chatId} not in allowedChatIds`);
  }

  const result = await tgCall<{ message_id: number }>(token, "sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4096),
  });
  return `sent telegram to ${chatId} (message_id=${result.message_id})`;
}

/** Short getUpdates poll (timeout 0) — safe to call from daemon wake. */
export async function pollTelegram(co: Company, cfg: TelegramConnectorConfig): Promise<number> {
  const token = envSecret(cfg.botTokenEnv, "telegram");
  const state = loadState(co);
  const offset = (state.telegram?.lastUpdateId ?? 0) + 1;
  const updates = await tgCall<TgUpdate[]>(token, "getUpdates", {
    offset,
    timeout: 0,
    allowed_updates: ["message"],
  });

  const allowed = new Set((cfg.allowedChatIds ?? []).map(String).filter(Boolean));
  let ingested = 0;
  let maxId = state.telegram?.lastUpdateId ?? 0;

  for (const u of updates) {
    if (u.update_id > maxId) maxId = u.update_id;
    const msg = u.message;
    if (!msg) continue;
    const chatId = String(msg.chat.id);
    if (allowed.size && !allowed.has(chatId)) continue;
    const text = (msg.text || msg.caption || "").trim();
    if (!text) continue;
    const who =
      msg.from?.username ||
      msg.from?.first_name ||
      msg.chat.username ||
      msg.chat.title ||
      chatId;
    const event: InboundEvent = {
      channel: "telegram",
      from: `telegram:${chatId}`,
      subject: `tg from ${who}`,
      body: truncate(
        [
          `Chat id: ${chatId}`,
          `From: ${who}`,
          `Message id: ${msg.message_id}`,
          "",
          text,
        ].join("\n"),
        4000
      ),
      externalId: `update-${u.update_id}`,
      createTask: true,
    };
    ingestInbound(co, event, cfg.routeTo);
    ingested++;
  }

  const next = loadState(co);
  next.telegram = { lastUpdateId: maxId };
  saveState(co, next);
  return ingested;
}
