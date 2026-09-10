import { truncate } from "../../util.js";
import type { Tool } from "./types.js";
import { OUTPUT_CAP, str } from "./types.js";

/** Models mangle URLs constantly ("https.example.com", "example.com/x",
 * trailing quotes). Repair deterministically instead of erroring. */
export function repairUrl(raw: string): string {
  let url = raw.trim().replace(/^['"<(\[]+|['">)\].,;]+$/g, "");
  url = url.replace(/^https?[.:,;]\/*(?=[\w-])/i, (m) =>
    m.toLowerCase().startsWith("https") ? "https://" : "http://"
  );
  if (!/^https?:\/\//i.test(url)) {
    if (/^[\w-]+(\.[\w-]+)+([/?#]|$)/.test(url)) url = "https://" + url;
  }
  return url;
}

export const fetchTool: Tool = {
  name: "fetch",
  doc: 'fetch — download a web page as plain text. args: {"url": "https://..."}',
  async run(_ctx, args) {
    const url = repairUrl(str(args.url));
    if (!/^https?:\/\//.test(url)) {
      throw new Error(`not a usable URL: "${str(args.url)}" — give a full address like https://example.com/page`);
    }
    let res: Response | null = null;
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < 2 && !res; attempt++) {
      try {
        res = await fetch(url, {
          signal: AbortSignal.timeout(20_000),
          headers: { "user-agent": "ai-company-os/0.1 (+agent swarm research)" },
        });
      } catch (e) {
        lastErr = e as Error; // transient network error — retry once
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    if (!res) {
      throw new Error(`site unreachable after 2 attempts (${lastErr?.message ?? "network error"}): ${url}`);
    }
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#\d+;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return `HTTP ${res.status}\n` + truncate(text, OUTPUT_CAP);
  },
};
