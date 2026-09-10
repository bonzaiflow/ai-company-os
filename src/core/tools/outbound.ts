import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter, truncate } from "../../util.js";
import type { Tool } from "./types.js";
import { str } from "./types.js";

/** Peek unread INBOX messages (does not consume). Optional channel filter. */
function peekInbox(
  companyDir: string,
  agent: string,
  channel?: string,
  limit = 10
): string {
  const inbox = path.join(companyDir, "agents", agent, "INBOX");
  if (!fs.existsSync(inbox)) return "(no unread messages)";
  const files = fs
    .readdirSync(inbox)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .reverse();
  const out: string[] = [];
  for (const f of files) {
    if (out.length >= limit) break;
    const { meta, body } = parseFrontmatter(fs.readFileSync(path.join(inbox, f), "utf8"));
    if (channel && meta.channel !== channel) continue;
    out.push(
      `# ${meta.subject || f}\nfrom: ${meta.from || "?"} · channel: ${meta.channel || "—"}\n` +
        truncate(body.trim(), 800)
    );
  }
  const empty = channel ? `(no unread ${channel} messages)` : "(no unread messages)";
  return out.length ? out.join("\n\n---\n\n") : empty;
}

export const emailTool: Tool = {
  name: "email",
  doc:
    'email — send or read email via the company email connector. ' +
    'args: {"op":"send","to":"a@b.com","subject":"...","body":"...","cc":"..."?} or {"op":"read","limit":5}. ' +
    "Requires company.json connectors.email (SMTP; IMAP for read). Secrets via env vars named in config.",
  async run(ctx, args) {
    const cfg = ctx.company.meta.connectors?.email;
    if (!cfg?.smtp) {
      return 'error: email connector not configured — set company.json connectors.email (smtp + from; imap for read)';
    }
    const op = str(args.op) || "send";
    if (op === "send") {
      const { sendEmail } = await import("../connectors/email.js");
      return await sendEmail(cfg, {
        to: str(args.to),
        subject: str(args.subject),
        body: str(args.body),
        cc: str(args.cc) || undefined,
      });
    }
    if (op === "read") {
      const { pollEmail } = await import("../connectors/email.js");
      if (cfg.imap) {
        try {
          await pollEmail(ctx.company, cfg);
        } catch (e) {
          return `error polling imap: ${(e as Error).message}`;
        }
      }
      const limit = Math.min(20, Math.max(1, Number(args.limit) || 5));
      return peekInbox(ctx.company.dir, ctx.agent, "email", limit);
    }
    return 'error: unknown op (use "send" or "read")';
  },
};

export const telegramTool: Tool = {
  name: "telegram",
  doc:
    'telegram — send or read Telegram via the company bot connector (typically for the chief). ' +
    'args: {"op":"send","chatId":"123456","text":"..."} or {"op":"read","limit":5}. ' +
    "Requires connectors.telegram.botTokenEnv. Owners also use the interactive bot (buttons) via telegram listen / webhook.",
  async run(ctx, args) {
    const cfg = ctx.company.meta.connectors?.telegram;
    if (!cfg?.botTokenEnv) {
      return "error: telegram connector not configured — set company.json connectors.telegram.botTokenEnv";
    }
    const op = str(args.op) || "send";
    if (op === "send") {
      const { sendTelegram } = await import("../connectors/telegram.js");
      return await sendTelegram(cfg, { chatId: str(args.chatId), text: str(args.text) });
    }
    if (op === "read") {
      const { pollTelegram } = await import("../connectors/telegram.js");
      try {
        await pollTelegram(ctx.company, cfg);
      } catch (e) {
        return `error polling telegram: ${(e as Error).message}`;
      }
      const limit = Math.min(20, Math.max(1, Number(args.limit) || 5));
      return peekInbox(ctx.company.dir, ctx.agent, "telegram", limit);
    }
    return 'error: unknown op (use "send" or "read")';
  },
};

export const webhookTool: Tool = {
  name: "webhook",
  doc:
    'webhook — HTTP POST to an external URL (outbound). ' +
    'args: {"op":"post","url":"https://...","body":{...}|"string","headers":{...}?}. ' +
    "Inbound webhooks use POST /api/hooks/<company-slug> with x-connector-secret — they land in INBOX, not this tool.",
  async run(ctx, args) {
    const cfg = ctx.company.meta.connectors?.webhook;
    const op = str(args.op) || "post";
    if (op !== "post") return 'error: unknown op (use "post")';
    const { postWebhook } = await import("../connectors/webhook.js");
    let body: unknown = args.body;
    if (body === undefined && args.text !== undefined) body = str(args.text);
    return await postWebhook(cfg, {
      url: str(args.url),
      body: body ?? {},
      headers:
        args.headers && typeof args.headers === "object" && !Array.isArray(args.headers)
          ? Object.fromEntries(
              Object.entries(args.headers as Record<string, unknown>).map(([k, v]) => [k, String(v)])
            )
          : undefined,
    });
  },
};
