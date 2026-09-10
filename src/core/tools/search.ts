import { truncate } from "../../util.js";
import type { Tool } from "./types.js";
import { OUTPUT_CAP, str } from "./types.js";

export const searchTool: Tool = {
  name: "search",
  doc: 'search — web search, returns titles + real URLs + snippets. args: {"query": "recruitment agencies Munich"}',
  async run(_ctx, args) {
    const q = str(args.query);
    if (!q.trim()) throw new Error("query is required");
    const res = await fetch(
      "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q),
      {
        signal: AbortSignal.timeout(20_000),
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        },
      }
    );
    if (!res.ok) throw new Error(`search failed: HTTP ${res.status}`);
    const html = await res.text();
    const results: string[] = [];
    const re =
      /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && results.length < 8) {
      let url = m[1];
      // ddg wraps real urls: //duckduckgo.com/l/?uddg=<encoded>&rut=...
      const uddg = /[?&]uddg=([^&]+)/.exec(url);
      if (uddg) url = decodeURIComponent(uddg[1]);
      // drop ads/trackers — huge y.js/aclick URLs bury the real results
      if (/duckduckgo\.com\/y\.js|bing\.com\/aclick|ad_domain=/.test(url)) continue;
      const clean = (s: string) =>
        s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
      results.push(
        `${results.length + 1}. ${clean(m[2])}\n   ${url}` +
          (m[3] ? `\n   ${clean(m[3]).slice(0, 200)}` : "")
      );
    }
    if (!results.length) return "no results found for: " + q;
    return truncate(results.join("\n"), OUTPUT_CAP);
  },
};
