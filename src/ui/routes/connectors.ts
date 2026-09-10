import {
  deleteTelegramWebhook,
  envSecret,
  handleTelegramWebhookUpdate,
  handleWebhook,
  pollConnectors,
  publicState as connectorPublicState,
  sendEmail,
  sendTelegram,
  sendTelegramMenu,
  setTelegramWebhook,
  telegramWebhookInfo,
  postWebhook,
  type TgUpdate,
} from "../../core/connectors/index.js";
import { Company } from "../../core/store.js";
import type { ConnectorsConfig } from "../../types.js";
import { json, readBody } from "../http.js";
import type { RouteHandler } from "./types.js";

/** /api/connectors* and /api/hooks/* — external connectors + Telegram bot webhook. */
export const handleConnectorsRoutes: RouteHandler = async ({ root, req, res, url }) => {
  if (req.method === "GET" && url.pathname === "/api/connectors") {
    const co = Company.open(root, url.searchParams.get("company") ?? "");
    const connectors = co.meta.connectors ?? {};
    const envSet = (name?: string) => !!(name && process.env[name]);
    json(res, {
      connectors,
      state: connectorPublicState(co),
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
      agents: co.listAgents().map((a) => a.name),
      approveTools: co.meta.policies?.approveTools ?? [],
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/connectors") {
    const body = await readBody(req);
    const co = Company.open(root, String(body.company ?? ""));
    const connectors = (body.connectors ?? {}) as ConnectorsConfig;
    // Strip empty connector blocks so disabled = absent
    const cleaned: ConnectorsConfig = {};
    if (connectors.email?.smtp?.host && connectors.email?.smtp?.user) {
      cleaned.email = connectors.email;
    }
    if (connectors.telegram) {
      const tg = connectors.telegram;
      cleaned.telegram = {
        ...tg,
        botTokenEnv: (tg.botTokenEnv ?? "").trim() || "TELEGRAM_BOT_TOKEN",
      };
    }
    if (connectors.webhook?.inboundSecretEnv) {
      cleaned.webhook = connectors.webhook;
    }
    const patch: { connectors: ConnectorsConfig; policies?: { approveTools?: string[] } } = {
      connectors: cleaned,
    };
    if (body.gateOutbound) {
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
    json(res, { ok: true, connectors: cleaned });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/connectors/poll") {
    const body = await readBody(req);
    const co = Company.open(root, String(body.company ?? ""));
    const result = await pollConnectors(co);
    json(res, { ok: true, ...result, state: connectorPublicState(co) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/connectors/test") {
    const body = await readBody(req);
    const co = Company.open(root, String(body.company ?? ""));
    const kind = String(body.kind ?? "");
    const cfg = co.meta.connectors;
    try {
      if (kind === "email") {
        if (!cfg?.email) throw new Error("email connector not configured");
        const to = String(body.to || cfg.email.from || cfg.email.smtp.user);
        const msg = await sendEmail(cfg.email, {
          to,
          subject: "[ai-company-os] test email",
          body: `Test from company ${co.meta.slug} at ${new Date().toISOString()}`,
        });
        json(res, { ok: true, detail: msg });
        return true;
      }
      if (kind === "telegram") {
        if (!cfg?.telegram) throw new Error("telegram connector not configured");
        const chatId = String(body.chatId || cfg.telegram.allowedChatIds?.[0] || "");
        if (!chatId) throw new Error("chatId required (or set allowedChatIds[0])");
        const withMenu = body.menu !== false && body.menu !== "false";
        const msg = withMenu
          ? await sendTelegramMenu(co, cfg.telegram, chatId)
          : await sendTelegram(cfg.telegram, {
              chatId,
              text: `Test from ai-company-os company ${co.meta.slug}`,
            });
        json(res, { ok: true, detail: msg });
        return true;
      }
      if (kind === "telegram-menu") {
        if (!cfg?.telegram) throw new Error("telegram connector not configured");
        const chatId = String(body.chatId || cfg.telegram.allowedChatIds?.[0] || "");
        if (!chatId) throw new Error("chatId required (or set allowedChatIds[0])");
        const msg = await sendTelegramMenu(co, cfg.telegram, chatId);
        json(res, { ok: true, detail: msg });
        return true;
      }
      if (kind === "webhook") {
        const urlOut = String(body.url || "");
        if (!urlOut) throw new Error("url required for webhook test");
        const msg = await postWebhook(cfg?.webhook, {
          url: urlOut,
          body: { text: `test from ${co.meta.slug}`, from: "ai-company-os" },
        });
        json(res, { ok: true, detail: msg });
        return true;
      }
      json(res, { error: "kind must be email|telegram|telegram-menu|webhook" }, 400);
    } catch (e) {
      json(res, { error: (e as Error).message }, 400);
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/connectors/telegram/webhook") {
    const body = await readBody(req);
    const co = Company.open(root, String(body.company ?? ""));
    const tg = co.meta.connectors?.telegram;
    if (!tg) {
      json(res, { error: "telegram connector not configured" }, 400);
      return true;
    }
    const action = String(body.action ?? "info");
    try {
      if (action === "set") {
        const hookUrl = String(body.url || "").trim();
        if (!hookUrl) throw new Error("url required");
        let secret: string | undefined;
        if (tg.webhookSecretEnv) secret = envSecret(tg.webhookSecretEnv, "telegram webhook");
        const detail = await setTelegramWebhook(tg, hookUrl, secret);
        json(res, { ok: true, detail, url: hookUrl });
        return true;
      }
      if (action === "delete") {
        const detail = await deleteTelegramWebhook(tg);
        json(res, { ok: true, detail });
        return true;
      }
      const info = await telegramWebhookInfo(tg);
      json(res, { ok: true, ...info });
      return true;
    } catch (e) {
      json(res, { error: (e as Error).message }, 400);
      return true;
    }
  }

  {
    const tgHook = /^\/api\/hooks\/telegram\/([^/]+)$/.exec(url.pathname);
    if (req.method === "POST" && tgHook) {
      const slug = decodeURIComponent(tgHook[1]);
      const co = Company.open(root, slug);
      const tg = co.meta.connectors?.telegram;
      if (!tg) {
        json(res, { error: "telegram connector not configured for this company" }, 404);
        return true;
      }
      if (tg.webhookSecretEnv) {
        const expected = envSecret(tg.webhookSecretEnv, "telegram webhook");
        const got = String(req.headers["x-telegram-bot-api-secret-token"] ?? "");
        if (got !== expected) {
          json(res, { error: "invalid telegram webhook secret" }, 401);
          return true;
        }
      }
      const body = (await readBody(req)) as TgUpdate;
      try {
        await handleTelegramWebhookUpdate(co, tg, body, { workspaceRoot: root });
        // Telegram expects 200 quickly
        res.writeHead(200, { "content-type": "application/json" });
        res.end("{}");
      } catch (e) {
        json(res, { error: (e as Error).message }, 500);
      }
      return true;
    }
  }

  {
    const hookMatch = /^\/api\/hooks\/([^/]+)$/.exec(url.pathname);
    if (req.method === "POST" && hookMatch) {
      const slug = decodeURIComponent(hookMatch[1]);
      // Don't steal /api/hooks/telegram/...
      if (slug === "telegram") return false;
      const co = Company.open(root, slug);
      const wh = co.meta.connectors?.webhook;
      if (!wh?.inboundSecretEnv) {
        json(res, { error: "webhook connector not configured for this company" }, 404);
        return true;
      }
      const secret =
        (req.headers["x-connector-secret"] as string | undefined) ||
        url.searchParams.get("secret") ||
        undefined;
      const body = await readBody(req);
      try {
        const result = handleWebhook(co, wh, body, secret);
        json(res, { ok: true, ...result });
      } catch (e) {
        const msg = (e as Error).message;
        json(res, { error: msg }, msg.includes("secret") ? 401 : 400);
      }
      return true;
    }
  }

  return false;
};
