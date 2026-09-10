import type { Command } from "commander";
import type { ConnectorsConfig } from "../types.js";
import {
  pollConnectors,
  publicState,
  sendEmail,
  sendTelegramMenu,
  postWebhook,
} from "../core/connectors/index.js";
import { c, readJson } from "../util.js";
import {
  companyOption,
  fail,
  openCompany,
  out,
  withJson,
  type CliCtx,
} from "./helpers.js";

function parseConnectorsJson(jsonArg: string): ConnectorsConfig {
  try {
    if (jsonArg.trim().startsWith("{")) return JSON.parse(jsonArg) as ConnectorsConfig;
    return readJson<ConnectorsConfig>(jsonArg, {});
  } catch (e) {
    return fail(`invalid JSON: ${(e as Error).message}`);
  }
}

export function registerConnectorCommands(program: Command, ctx: CliCtx): void {
  const conn = program
    .command("connectors")
    .description("configure and operate email / telegram / webhook connectors");

  withJson(
    companyOption(
      conn
        .command("get")
        .description("show connector config + poll state (secrets are env names only)")
        .action((opts) => {
          const co = openCompany(ctx, opts.company);
          const connectors = co.meta.connectors ?? {};
          const envSet = (name?: string) => !!(name && process.env[name]);
          out(
            {
              connectors,
              state: publicState(co),
              secrets: {
                emailSmtp: envSet(connectors.email?.smtp?.passEnv),
                emailImap: envSet(connectors.email?.imap?.passEnv),
                telegram: envSet(
                  connectors.telegram
                    ? (connectors.telegram.botTokenEnv || "").trim() || "TELEGRAM_BOT_TOKEN"
                    : undefined
                ),
                telegramWebhook: envSet(connectors.telegram?.webhookSecretEnv),
                webhook: envSet(connectors.webhook?.inboundSecretEnv),
              },
              hookPath: `/api/hooks/${co.meta.slug}`,
              telegramHookPath: `/api/hooks/telegram/${co.meta.slug}`,
              approveTools: co.meta.policies?.approveTools ?? [],
            },
            () => {
              console.log(JSON.stringify({ connectors, state: publicState(co) }, null, 2));
            }
          );
        })
    )
  );

  withJson(
    companyOption(
      conn
        .command("set")
        .description("replace connectors config from a JSON file or inline JSON")
        .argument("<json>", "path to JSON file, or inline JSON object")
        .option("--gate", "also add email/telegram/webhook to policies.approveTools")
        .action((jsonArg: string, opts) => {
          const co = openCompany(ctx, opts.company);
          const connectors = parseConnectorsJson(jsonArg);
          const cleaned: ConnectorsConfig = {};
          if (connectors.email?.smtp?.host && connectors.email?.smtp?.user) cleaned.email = connectors.email;
          if (connectors.telegram) {
            const tg = connectors.telegram;
            cleaned.telegram = {
              ...tg,
              botTokenEnv: (tg.botTokenEnv ?? "").trim() || "TELEGRAM_BOT_TOKEN",
            };
          }
          if (connectors.webhook?.inboundSecretEnv) cleaned.webhook = connectors.webhook;
          const patch: { connectors: ConnectorsConfig; policies?: { approveTools?: string[] } } = {
            connectors: cleaned,
          };
          if (opts.gate) {
            const current = new Set(co.meta.policies?.approveTools ?? []);
            for (const t of ["email", "telegram", "webhook"]) current.add(t);
            patch.policies = { ...(co.meta.policies ?? {}), approveTools: [...current] };
          }
          co.saveMeta(patch);
          co.audit({
            type: "connectors.saved",
            ok: true,
            detail: Object.keys(cleaned).join(",") || "(none)",
          });
          out({ ok: true, connectors: cleaned }, () => {
            console.log(c.green(`connectors saved: ${Object.keys(cleaned).join(", ") || "(cleared)"}`));
          });
        })
    )
  );

  withJson(
    companyOption(
      conn
        .command("poll")
        .description("poll inbound email/Telegram now")
        .action(async (opts) => {
          const co = openCompany(ctx, opts.company);
          const result = await pollConnectors(co);
          out({ ok: true, ...result, state: publicState(co) }, () => {
            console.log(
              `ingested ${result.ingested}` +
                (result.errors.length ? c.red(`  errors: ${result.errors.join("; ")}`) : "")
            );
          });
        })
    )
  );

  withJson(
    companyOption(
      conn
        .command("test")
        .description("send a test email / telegram / webhook")
        .argument("<kind>", "email | telegram | webhook")
        .option("--to <addr>", "email recipient")
        .option("--chat-id <id>", "telegram chat id")
        .option("--url <url>", "webhook URL")
        .action(async (kind: string, opts) => {
          const co = openCompany(ctx, opts.company);
          const cfg = co.meta.connectors;
          try {
            let detail = "";
            if (kind === "email") {
              if (!cfg?.email) fail("email connector not configured");
              detail = await sendEmail(cfg.email, {
                to: String(opts.to || cfg.email.from || cfg.email.smtp.user),
                subject: "[ai-company-os] test email",
                body: `Test from company ${co.meta.slug} at ${new Date().toISOString()}`,
              });
            } else if (kind === "telegram") {
              if (!cfg?.telegram) fail("telegram connector not configured");
              const chatId = String(opts.chatId || cfg.telegram.allowedChatIds?.[0] || "");
              if (!chatId) fail("chatId required (--chat-id or allowedChatIds[0])");
              detail = await sendTelegramMenu(co, cfg.telegram, chatId);
            } else if (kind === "webhook") {
              const urlOut = String(opts.url || "");
              if (!urlOut) fail("--url required for webhook test");
              detail = await postWebhook(cfg?.webhook, {
                url: urlOut,
                body: { text: `test from ${co.meta.slug}`, from: "ai-company-os" },
              });
            } else {
              fail("kind must be email|telegram|webhook");
            }
            out({ ok: true, detail }, () => console.log(c.green(detail)));
          } catch (e) {
            fail((e as Error).message);
          }
        })
    )
  );
}
