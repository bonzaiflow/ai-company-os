import type { Command } from "commander";
import {
  deleteTelegramWebhook,
  listenTelegram,
  sendTelegramMenu,
  setTelegramWebhook,
  telegramWebhookInfo,
} from "../core/connectors/index.js";
import { envSecret } from "../core/connectors/state.js";
import { c } from "../util.js";
import {
  companyOption,
  fail,
  openCompany,
  out,
  wantJson,
  withJson,
  type CliCtx,
} from "./helpers.js";

export function registerTelegramCommands(program: Command, ctx: CliCtx): void {
  const tg = program
    .command("telegram")
    .description("interactive Telegram bot (buttons, chief chat, run/pause/approvals)");

  withJson(
    companyOption(
      tg
        .command("listen")
        .description("long-poll Telegram updates for one company (interactive bot)")
        .action(async (opts) => {
          const co = openCompany(ctx, opts.company);
          const cfg = co.meta.connectors?.telegram;
          if (!cfg?.botTokenEnv) fail("telegram connector not configured — use connectors set first");
          await listenTelegram(co, cfg, {
            configRoot: ctx.root,
            log: (l) => {
              if (!wantJson()) console.log(c.dim(l));
            },
          });
        })
    )
  );

  withJson(
    companyOption(
      tg
        .command("menu")
        .description("send the interactive control-pad menu to a chat")
        .option("--chat-id <id>", "telegram chat id")
        .action(async (opts) => {
          const co = openCompany(ctx, opts.company);
          const cfg = co.meta.connectors?.telegram;
          if (!cfg?.botTokenEnv) fail("telegram connector not configured");
          const chatId = String(opts.chatId || cfg.allowedChatIds?.[0] || "");
          if (!chatId) fail("chatId required (--chat-id or allowedChatIds[0])");
          try {
            const detail = await sendTelegramMenu(co, cfg, chatId);
            out({ ok: true, detail }, () => console.log(c.green(detail)));
          } catch (e) {
            fail((e as Error).message);
          }
        })
    )
  );

  withJson(
    companyOption(
      tg
        .command("webhook")
        .description("manage Telegram webhook (for UI / public HTTPS)")
        .argument("<action>", "set | delete | info")
        .option("--url <url>", "public HTTPS URL for set (…/api/hooks/telegram/<slug>)")
        .action(async (action: string, opts) => {
          const co = openCompany(ctx, opts.company);
          const cfg = co.meta.connectors?.telegram;
          if (!cfg?.botTokenEnv) fail("telegram connector not configured");
          try {
            if (action === "set") {
              const url = String(opts.url || "").trim();
              if (!url) fail("--url required (must be HTTPS, ending in /api/hooks/telegram/<slug>)");
              let secret: string | undefined;
              if (cfg.webhookSecretEnv) {
                secret = envSecret(cfg.webhookSecretEnv, "telegram webhook");
              }
              const detail = await setTelegramWebhook(cfg, url, secret);
              out({ ok: true, detail, url }, () => console.log(c.green(detail)));
            } else if (action === "delete") {
              const detail = await deleteTelegramWebhook(cfg);
              out({ ok: true, detail }, () => console.log(c.green(detail)));
            } else if (action === "info") {
              const info = await telegramWebhookInfo(cfg);
              out({ ok: true, ...info }, () => {
                console.log(JSON.stringify(info, null, 2));
              });
            } else {
              fail("action must be set|delete|info");
            }
          } catch (e) {
            fail((e as Error).message);
          }
        })
    )
  );
}
