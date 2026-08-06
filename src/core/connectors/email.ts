import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import type { EmailConnectorConfig } from "../../types.js";
import { truncate } from "../../util.js";
import type { Company } from "../store.js";
import { ingestInbound } from "./ingest.js";
import { envSecret, loadState, saveState } from "./state.js";
import type { InboundEvent } from "./types.js";

export async function sendEmail(
  cfg: EmailConnectorConfig,
  opts: { to: string; subject: string; body: string; cc?: string }
): Promise<string> {
  if (!cfg.smtp?.host || !cfg.smtp?.user || !cfg.smtp?.passEnv) {
    throw new Error("email connector: smtp host/user/passEnv required");
  }
  const pass = envSecret(cfg.smtp.passEnv, "email.smtp");
  const transport = nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port || 587,
    secure: !!cfg.smtp.secure,
    auth: { user: cfg.smtp.user, pass },
  });
  const info = await transport.sendMail({
    from: cfg.from || cfg.smtp.user,
    to: opts.to,
    cc: opts.cc || undefined,
    subject: opts.subject,
    text: opts.body,
  });
  return `sent email to ${opts.to} (messageId=${info.messageId ?? "?"})`;
}

/** Poll IMAP for new messages since last UID; ingest into agent INBOX. */
export async function pollEmail(co: Company, cfg: EmailConnectorConfig): Promise<number> {
  if (!cfg.imap?.host || !cfg.imap?.user || !cfg.imap?.passEnv) return 0;
  const pass = envSecret(cfg.imap.passEnv, "email.imap");
  const state = loadState(co);
  const lastUid = state.email?.lastUid ?? 0;
  const mailbox = cfg.imap.mailbox || "INBOX";

  const client = new ImapFlow({
    host: cfg.imap.host,
    port: cfg.imap.port || 993,
    secure: cfg.imap.secure !== false,
    auth: { user: cfg.imap.user, pass },
    logger: false,
  });

  let ingested = 0;
  let maxUid = lastUid;
  try {
    await client.connect();
    const lock = await client.getMailboxLock(mailbox);
    try {
      // UID search: messages with UID > lastUid
      const uids =
        lastUid > 0
          ? await client.search({ uid: `${lastUid + 1}:*` }, { uid: true })
          : await client.search({ seen: false }, { uid: true });
      const list = Array.isArray(uids) ? uids : [];
      // On first poll with no cursor, only take the newest few so we don't flood
      const batch = lastUid === 0 ? list.slice(-10) : list.slice(0, 50);
      for (const uid of batch) {
        if (typeof uid !== "number" || uid <= lastUid) continue;
        const msg = await client.fetchOne(String(uid), { source: true, uid: true }, { uid: true });
        if (!msg || !msg.source) {
          if (uid > maxUid) maxUid = uid;
          continue;
        }
        const parsed = await simpleParser(msg.source);
        const fromAddr =
          parsed.from?.value?.[0]?.address ||
          parsed.from?.text ||
          "unknown";
        const subject = (parsed.subject || "(no subject)").slice(0, 200);
        const text =
          parsed.text?.trim() ||
          (parsed.html ? parsed.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "");
        const event: InboundEvent = {
          channel: "email",
          from: `email:${fromAddr}`,
          subject,
          body: truncate(
            [
              `From: ${parsed.from?.text ?? fromAddr}`,
              `To: ${parsed.to ? (typeof parsed.to === "object" && "text" in parsed.to ? parsed.to.text : String(parsed.to)) : ""}`,
              `Date: ${parsed.date?.toISOString?.() ?? ""}`,
              "",
              text || "(empty body)",
            ].join("\n"),
            6000
          ),
          externalId: `uid-${uid}`,
          createTask: true,
        };
        ingestInbound(co, event, cfg.routeTo);
        ingested++;
        if (uid > maxUid) maxUid = uid;
      }
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }

  const next = loadState(co);
  next.email = { lastUid: maxUid || lastUid };
  saveState(co, next);
  return ingested;
}
