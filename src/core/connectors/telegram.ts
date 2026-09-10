import type { TelegramConnectorConfig } from "../../types.js";
import type { Company } from "../store.js";
import { handleTelegramUpdate } from "./telegram-bot.js";
import {
  assertAllowedChat,
  tgDeleteWebhook,
  tgGetUpdates,
  tgGetWebhookInfo,
  tgSendMessage,
  tgSetWebhook,
  telegramToken,
  type InlineKeyboard,
  type TgUpdate,
} from "./telegram-api.js";
import { loadState, saveState } from "./state.js";

export {
  sendTelegramMenu,
  handleTelegramUpdate,
  mainMenuKeyboard,
} from "./telegram-bot.js";
export type { TgUpdate } from "./telegram-api.js";

export async function sendTelegram(
  cfg: TelegramConnectorConfig,
  opts: { chatId: string; text: string; replyMarkup?: InlineKeyboard }
): Promise<string> {
  const token = telegramToken(cfg);
  const chatId = String(opts.chatId ?? "").trim();
  if (!chatId) throw new Error("telegram: chatId is required");
  const text = String(opts.text ?? "").trim();
  if (!text) throw new Error("telegram: text is required");
  assertAllowedChat(cfg, chatId);

  const result = await tgSendMessage(token, {
    chatId,
    text,
    replyMarkup: opts.replyMarkup,
  });
  return `sent telegram to ${chatId} (message_id=${result.message_id})`;
}

/**
 * Poll getUpdates (short or long). Processes each update through the bot
 * handler (interactive buttons / chief chat) or legacy task ingest.
 */
export async function pollTelegram(
  co: Company,
  cfg: TelegramConnectorConfig,
  opts?: { timeout?: number; configRoot?: string }
): Promise<number> {
  const token = telegramToken(cfg);
  const state = loadState(co);
  const offset = (state.telegram?.lastUpdateId ?? 0) + 1;
  const updates = await tgGetUpdates(token, {
    offset,
    timeout: opts?.timeout ?? 0,
  });

  let handled = 0;
  let maxId = state.telegram?.lastUpdateId ?? 0;

  for (const u of updates) {
    if (u.update_id > maxId) maxId = u.update_id;
    try {
      const ok = await handleTelegramUpdate(co, cfg, u, {
        workspaceRoot: opts?.configRoot,
      });
      if (ok) handled++;
    } catch (e) {
      // Advance cursor anyway so a bad update doesn't brick the poll loop
      co.audit({
        type: "connector.telegram.error",
        ok: false,
        detail: `update ${u.update_id}: ${(e as Error).message}`.slice(0, 300),
      });
    }
  }

  const next = loadState(co);
  next.telegram = { lastUpdateId: maxId };
  saveState(co, next);
  return handled;
}

/** Long-poll loop for CLI `telegram listen`. */
export async function listenTelegram(
  co: Company,
  cfg: TelegramConnectorConfig,
  opts: {
    log?: (line: string) => void;
    shouldStop?: () => boolean;
    configRoot?: string;
  } = {}
): Promise<void> {
  const log = opts.log ?? (() => {});
  log("telegram listen started (long-poll). Ctrl-C to stop.");
  // Clear webhook so getUpdates works
  try {
    const token = telegramToken(cfg);
    const info = await tgGetWebhookInfo(token);
    if (info.url) {
      await tgDeleteWebhook(token);
      log(`cleared webhook ${info.url} so polling can run`);
    }
  } catch (e) {
    log(`webhook check: ${(e as Error).message}`);
  }

  while (!opts.shouldStop?.()) {
    try {
      const n = await pollTelegram(co, cfg, { timeout: 25, configRoot: opts.configRoot });
      if (n) log(`handled ${n} update(s)`);
    } catch (e) {
      log(`poll error: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

export async function setTelegramWebhook(
  cfg: TelegramConnectorConfig,
  url: string,
  secret?: string
): Promise<string> {
  const token = telegramToken(cfg);
  await tgSetWebhook(token, { url, secretToken: secret });
  return `webhook set → ${url}`;
}

export async function deleteTelegramWebhook(cfg: TelegramConnectorConfig): Promise<string> {
  const token = telegramToken(cfg);
  await tgDeleteWebhook(token);
  return "webhook deleted";
}

export async function telegramWebhookInfo(cfg: TelegramConnectorConfig): Promise<{
  url: string;
  pending_update_count: number;
  last_error_message?: string;
}> {
  return tgGetWebhookInfo(telegramToken(cfg));
}

/** Handle a raw Update from Telegram's webhook POST. */
export async function handleTelegramWebhookUpdate(
  co: Company,
  cfg: TelegramConnectorConfig,
  update: TgUpdate,
  opts?: { workspaceRoot?: string }
): Promise<void> {
  await handleTelegramUpdate(co, cfg, update, opts);
  const state = loadState(co);
  const id = update.update_id ?? 0;
  if (id > (state.telegram?.lastUpdateId ?? 0)) {
    state.telegram = { lastUpdateId: id };
    saveState(co, state);
  }
}
