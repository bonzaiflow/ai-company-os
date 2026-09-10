import type { TelegramConnectorConfig } from "../../types.js";
import { envSecret } from "./state.js";

export function apiBase(token: string): string {
  return `https://api.telegram.org/bot${token}`;
}

export interface TgUser {
  id: number;
  username?: string;
  first_name?: string;
}

export interface TgChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
}

export interface TgMessage {
  message_id: number;
  text?: string;
  caption?: string;
  chat: TgChat;
  from?: TgUser;
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

export type InlineKeyboard = { inline_keyboard: { text: string; callback_data: string }[][] };

export async function tgCall<T>(
  token: string,
  method: string,
  body?: Record<string, unknown>,
  timeoutMs = 25_000
): Promise<T> {
  const res = await fetch(`${apiBase(token)}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = (await res.json()) as { ok: boolean; description?: string; result: T };
  if (!data.ok) throw new Error(`telegram ${method}: ${data.description ?? res.status}`);
  return data.result;
}

export function telegramToken(cfg: TelegramConnectorConfig): string {
  return envSecret(cfg.botTokenEnv, "telegram");
}

export function assertAllowedChat(cfg: TelegramConnectorConfig, chatId: string): void {
  const allowed = cfg.allowedChatIds?.map(String).filter(Boolean) ?? [];
  if (allowed.length && !allowed.includes(chatId)) {
    throw new Error(`telegram: chatId ${chatId} not in allowedChatIds`);
  }
}

export function isChatAllowed(cfg: TelegramConnectorConfig, chatId: string): boolean {
  const allowed = cfg.allowedChatIds?.map(String).filter(Boolean) ?? [];
  return !allowed.length || allowed.includes(chatId);
}

export async function tgSendMessage(
  token: string,
  opts: {
    chatId: string;
    text: string;
    replyMarkup?: InlineKeyboard;
    parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  }
): Promise<{ message_id: number }> {
  const body: Record<string, unknown> = {
    chat_id: opts.chatId,
    text: opts.text.slice(0, 4096),
  };
  if (opts.replyMarkup) body.reply_markup = opts.replyMarkup;
  if (opts.parseMode) body.parse_mode = opts.parseMode;
  return tgCall(token, "sendMessage", body);
}

export async function tgAnswerCallback(
  token: string,
  callbackQueryId: string,
  text?: string
): Promise<boolean> {
  return tgCall(token, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: text?.slice(0, 200),
    show_alert: false,
  });
}

export async function tgEditMessageText(
  token: string,
  opts: {
    chatId: string;
    messageId: number;
    text: string;
    replyMarkup?: InlineKeyboard;
  }
): Promise<unknown> {
  const body: Record<string, unknown> = {
    chat_id: opts.chatId,
    message_id: opts.messageId,
    text: opts.text.slice(0, 4096),
  };
  if (opts.replyMarkup) body.reply_markup = opts.replyMarkup;
  return tgCall(token, "editMessageText", body);
}

export async function tgGetUpdates(
  token: string,
  opts: { offset?: number; timeout?: number }
): Promise<TgUpdate[]> {
  return tgCall(
    token,
    "getUpdates",
    {
      offset: opts.offset,
      timeout: opts.timeout ?? 0,
      allowed_updates: ["message", "callback_query"],
    },
    // long-poll needs headroom beyond Telegram's timeout
    ((opts.timeout ?? 0) + 10) * 1000
  );
}

export async function tgSetWebhook(
  token: string,
  opts: { url: string; secretToken?: string }
): Promise<boolean> {
  const body: Record<string, unknown> = {
    url: opts.url,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  };
  if (opts.secretToken) body.secret_token = opts.secretToken;
  return tgCall(token, "setWebhook", body);
}

export async function tgDeleteWebhook(token: string): Promise<boolean> {
  return tgCall(token, "deleteWebhook", { drop_pending_updates: false });
}

export async function tgGetWebhookInfo(token: string): Promise<{
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_message?: string;
}> {
  return tgCall(token, "getWebhookInfo", {});
}
