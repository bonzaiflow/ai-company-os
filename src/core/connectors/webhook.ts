import type { WebhookConnectorConfig } from "../../types.js";
import { truncate } from "../../util.js";
import type { Company } from "../store.js";
import { ingestInbound } from "./ingest.js";
import { envSecret } from "./state.js";

export async function postWebhook(
  cfg: WebhookConnectorConfig | undefined,
  opts: { url: string; body: unknown; headers?: Record<string, string> }
): Promise<string> {
  const url = String(opts.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("webhook: url must be http(s)");
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`webhook: invalid url ${url}`);
  }
  const allow = cfg?.allowedHosts?.map((h) => h.toLowerCase()).filter(Boolean) ?? [];
  if (allow.length && !allow.includes(host.toLowerCase())) {
    throw new Error(`webhook: host ${host} not in allowedHosts`);
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "ai-company-os/0.1 (+webhook connector)",
    ...(opts.headers ?? {}),
  };
  const body =
    typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body ?? {});
  const res = await fetch(url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  return `HTTP ${res.status}\n` + truncate(text, 2000);
}

export function verifyWebhookSecret(
  cfg: WebhookConnectorConfig,
  provided: string | null | undefined
): void {
  const expected = envSecret(cfg.inboundSecretEnv, "webhook");
  if (!provided || provided !== expected) {
    throw new Error("webhook: invalid or missing secret");
  }
}

/** Handle an authenticated inbound webhook payload. */
export function handleWebhook(
  co: Company,
  cfg: WebhookConnectorConfig,
  payload: { text?: string; subject?: string; from?: string; [k: string]: unknown },
  secret: string | null | undefined
): { agent: string; taskId?: string } {
  verifyWebhookSecret(cfg, secret);
  const text =
    typeof payload.text === "string"
      ? payload.text
      : truncate(JSON.stringify(payload, null, 2), 4000);
  const subject =
    (typeof payload.subject === "string" && payload.subject) ||
    `webhook ${new Date().toISOString().slice(0, 19)}`;
  const from =
    (typeof payload.from === "string" && payload.from) || "webhook:inbound";
  return ingestInbound(
    co,
    {
      channel: "webhook",
      from: from.startsWith("webhook:") ? from : `webhook:${from}`,
      subject: subject.slice(0, 200),
      body: text,
      externalId: `hook-${Date.now()}`,
      createTask: true,
    },
    cfg.routeTo
  );
}
