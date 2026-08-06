import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ensureDir, parseFrontmatter, truncate } from "../util.js";
import type { Company } from "./store.js";

const OUTPUT_CAP = 4000;

export interface ToolContext {
  company: Company;
  agent: string;
  /** cooperative stop — long-running tools (discover) check this between
   * units of work so an owner Stop lands within seconds, not minutes */
  shouldStop?: () => boolean;
}

export interface Tool {
  name: string;
  /** one-line description + args, shown to the model */
  doc: string;
  run(ctx: ToolContext, args: Record<string, unknown>): Promise<string>;
}

/** Resolve a user/model supplied path inside the company dir, or throw.
 * Agents may only touch files within their company. */
function safePath(companyDir: string, p: string): string {
  const resolved = path.resolve(companyDir, String(p ?? ""));
  if (resolved !== companyDir && !resolved.startsWith(companyDir + path.sep)) {
    throw new Error(`path escapes company directory: ${p}`);
  }
  return resolved;
}

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

export const filesystemTool: Tool = {
  name: "filesystem",
  doc:
    'filesystem — read/write files in the company directory. args: {"op": "read"|"write"|"append"|"list", "path": "data/notes.md", "content": "..."(for write/append)}. ' +
    "Large files return size + a short sample only — never rewrite a truncated CSV stub; call importdata on the original path instead.",
  async run(ctx, args) {
    const op = str(args.op);
    const rel = str(args.path);
    const p = safePath(ctx.company.dir, rel);
    switch (op) {
      case "read": {
        if (!fs.existsSync(p)) throw new Error(`no such file: ${rel}`);
        const st = fs.statSync(p);
        const text = fs.readFileSync(p, "utf8");
        if (text.length <= OUTPUT_CAP) return text;
        const lines = text.split(/\r?\n/);
        const headLines = Math.min(12, lines.length);
        const head = lines.slice(0, headLines).join("\n");
        const dataLines = Math.max(0, lines.length - (lines[lines.length - 1] === "" ? 2 : 1));
        return (
          `[file ${rel}: ${st.size} bytes, ~${dataLines} data lines — TOO LARGE to return in full]\n` +
          `Do NOT rewrite a truncated copy. For business CSV/JSON/GeoJSON use importdata on this exact path.\n` +
          `--- first ${headLines} lines ---\n` +
          head +
          `\n… [${text.length - head.length} chars omitted]`
        );
      }
      case "write": {
        const content = str(args.content);
        // Agents used to clobber multi-MB uploads with ~11-row CSV stubs after a
        // truncated read. Refuse that class of overwrite; write a new path instead.
        if (fs.existsSync(p)) {
          const st = fs.statSync(p);
          const underUploads = /(^|[/\\])data[/\\]uploads([/\\]|$)/i.test(rel.replace(/\\/g, "/"));
          if (underUploads && st.size > 50_000 && content.length < st.size * 0.5) {
            throw new Error(
              `refusing to overwrite large upload ${rel} (${st.size} B) with a ${content.length} B stub — ` +
                `call importdata on the original, or write a NEW path (e.g. …_work.csv)`
            );
          }
        }
        ensureDir(path.dirname(p));
        fs.writeFileSync(p, content);
        return `wrote ${content.length} chars to ${rel}`;
      }
      case "append":
        ensureDir(path.dirname(p));
        fs.appendFileSync(p, str(args.content) + "\n");
        return `appended to ${rel}`;
      case "list": {
        const entries = fs.readdirSync(p, { withFileTypes: true });
        return entries.map((e) => (e.isDirectory() ? e.name + "/" : e.name)).join("\n") || "(empty)";
      }
      default:
        throw new Error(`unknown op "${op}" (use read|write|append|list)`);
    }
  },
};

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

export const sqliteTool: Tool = {
  name: "sqlite",
  doc: 'sqlite — run SQL against a database file under data/. args: {"db": "main.db", "sql": "CREATE TABLE ..."}',
  async run(ctx, args) {
    const dbName = str(args.db) || "main.db";
    if (!/^[\w.-]+$/.test(dbName)) throw new Error("db must be a plain filename");
    const dbPath = safePath(ctx.company.dir, path.join("data", dbName));
    ensureDir(path.dirname(dbPath));
    const db = new DatabaseSync(dbPath);
    try {
      const sql = str(args.sql);
      if (!sql.trim()) throw new Error("sql is required");
      if (/^\s*(select|pragma|with)/i.test(sql)) {
        const rows = db.prepare(sql).all();
        return truncate(
          rows.length ? JSON.stringify(rows.slice(0, 50), null, 1) : "(no rows)",
          OUTPUT_CAP
        );
      }
      // single write statement: report affected rows — vital feedback for
      // small models ("0 rows inserted" breaks their repeat loops)
      if (!sql.replace(/;\s*$/, "").includes(";")) {
        const info = db.prepare(sql).run();
        return /^\s*insert/i.test(sql)
          ? `ok — ${info.changes} row(s) inserted`
          : /^\s*(update|delete)/i.test(sql)
            ? `ok — ${info.changes} row(s) affected`
            : "ok";
      }
      db.exec(sql);
      return "ok";
    } finally {
      db.close();
    }
  },
};

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

// portals/directories/social — not the businesses we want as leads
const NON_BUSINESS =
  /(^|\.)(duckduckgo|bing|google|facebook|instagram|linkedin|twitter|x|youtube|tiktok|pinterest|xing|yelp|11880|gelbeseiten|dasoertliche|dastelefonbuch|wlw|clutch|wikipedia|meinestadt|cylex|goyellow|firmenwissen|northdata|kununu|indeed|stepstone|amazon|ebay|apple|microsoft|github|reddit)\./i;

async function ddgDomains(query: string): Promise<{ host: string; url: string; title: string }[]> {
  const out: { host: string; url: string; title: string }[] = [];
  for (let s = 0; s <= 30; s += 30) {
    // DDG returns nothing useful past ~2 pages; POST form with de-de locale
    const body = new URLSearchParams({ q: query, kl: "de-de", s: String(s), dc: String(s + 1) });
    let html = "";
    try {
      const r = await fetch("https://html.duckduckgo.com/html/", {
        method: "POST",
        signal: AbortSignal.timeout(20_000),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        },
        body,
      });
      html = await r.text();
    } catch {
      break;
    }
    const re = /class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    let onPage = 0;
    while ((m = re.exec(html))) {
      let url = m[1];
      const uddg = /[?&]uddg=([^&]+)/.exec(url);
      if (uddg) url = decodeURIComponent(uddg[1]);
      if (/y\.js|aclick|ad_domain=/.test(url)) continue;
      let host: string;
      try {
        host = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        continue;
      }
      if (NON_BUSINESS.test(host)) continue;
      const title = m[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
      out.push({ host, url: `https://${host}/`, title });
      onPage++;
    }
    if (onPage === 0) break;
    await new Promise((r) => setTimeout(r, 600));
  }
  return out;
}

interface Business {
  name: string;
  website: string;
  email: string;
  phone: string;
  city: string;
  /** Extra columns to fill when the target table already has them (trade, address, …). */
  extra?: Record<string, string>;
}

// trade word → OpenStreetMap craft/shop/office tag values (handwerk-focused)
const TRADE_OSM: Record<string, string> = {
  shk: "plumber|hvac", sanitär: "plumber|hvac", heizung: "plumber|hvac", plumber: "plumber|hvac",
  elektro: "electrician", elektriker: "electrician", electrician: "electrician",
  dach: "roofer", dachdecker: "roofer", roofer: "roofer",
  tischler: "carpenter|joiner", schreiner: "carpenter|joiner", carpenter: "carpenter|joiner",
  maler: "painter", painter: "painter", fliesen: "tiler", tiler: "tiler",
  zimmer: "carpenter", bau: "builder", metall: "metal_construction", garten: "gardener",
};
const DEFAULT_CRAFTS = "plumber|hvac|electrician|roofer|carpenter|joiner|painter|tiler|plasterer|metal_construction|glaziery|builder|gardener";

/** A business CATEGORY → the OpenStreetMap tag selectors that find it. discover
 * queries these tags; this is what makes it find the RIGHT businesses instead of
 * always returning handwerk. Add categories here as new use-cases appear. */
interface OsmCategory {
  label: string;
  match: RegExp; // matches trade words or segment text
  selectors: string[]; // OSM tag filters, e.g. '"office"="employment_agency"'
  exclude?: RegExp; // drop results whose name matches (e.g. public job centers)
}
const OSM_CATEGORIES: OsmCategory[] = [
  {
    label: "recruitment/staffing",
    match: /recruit|staffing|personal|headhunt|executive.?search|zeitarbeit|arbeitsvermittl|personaldienst|hr\b/i,
    selectors: ['"office"="employment_agency"', '"office"="recruitment"', '"office"="temp_agency"'],
    // exclude public/government job centres — we want private firms
    exclude: /jobcenter|job.?center|arbeitsagentur|agentur für arbeit|bundesagentur|jobpoint|jobbörse|sozialamt/i,
  },
  {
    label: "handwerk/craft",
    match: /shk|sanit|heizung|elektr|dach|tischler|schreiner|maler|fliesen|zimmer|\bbau\b|metall|garten|handwerk|plumber|electric|roof|carpenter|paint|tiler|craft/i,
    selectors: [], // filled in from craft tags below
  },
];

/** Resolve which OSM tag selectors to query from the requested trades+segment.
 * Returns null when it CANNOT tell — discover then refuses rather than guessing
 * (silently returning the wrong kind of business is the bug we're killing). */
function resolveOsmSelectors(
  trades: string[],
  segment: string
): { label: string; selectors: string[]; exclude?: RegExp } | null {
  const hay = [...trades, segment].join(" ").toLowerCase();
  // craft mapping takes priority when explicit craft trades are given
  const craftVals = [
    ...new Set(trades.flatMap((t) => (TRADE_OSM[t] ?? "").split("|")).filter(Boolean)),
  ];
  for (const cat of OSM_CATEGORIES) {
    if (!cat.match.test(hay)) continue;
    if (cat.label.startsWith("handwerk")) {
      const crafts = craftVals.length ? craftVals.join("|") : DEFAULT_CRAFTS;
      return {
        label: cat.label,
        selectors: [`"craft"~"${crafts}"`, '"shop"~"plumber|electrician|hardware|doityourself"', '"office"="craftsman"'],
      };
    }
    return { label: cat.label, selectors: cat.selectors, exclude: cat.exclude };
  }
  // explicit craft trades but no keyword hit → still craft
  if (craftVals.length) {
    return { label: "handwerk/craft", selectors: [`"craft"~"${craftVals.join("|")}"`, '"office"="craftsman"'] };
  }
  return null;
}

// ~260 DACH cities/towns, roughly by size — the auto-sweep walks this in order,
// skipping ones already represented in the table, so each round hits new ground.
export const DACH_CITIES = [
  "Berlin","Hamburg","München","Köln","Frankfurt am Main","Stuttgart","Düsseldorf","Leipzig","Dortmund","Essen",
  "Bremen","Dresden","Hannover","Nürnberg","Duisburg","Bochum","Wuppertal","Bielefeld","Bonn","Münster",
  "Karlsruhe","Mannheim","Augsburg","Wiesbaden","Mönchengladbach","Gelsenkirchen","Aachen","Braunschweig","Chemnitz","Kiel",
  "Halle","Magdeburg","Freiburg im Breisgau","Krefeld","Mainz","Lübeck","Erfurt","Oberhausen","Rostock","Kassel",
  "Hagen","Potsdam","Saarbrücken","Hamm","Ludwigshafen","Mülheim an der Ruhr","Oldenburg","Osnabrück","Leverkusen","Heidelberg",
  "Darmstadt","Solingen","Herne","Neuss","Regensburg","Paderborn","Ingolstadt","Offenbach","Fürth","Würzburg",
  "Ulm","Heilbronn","Pforzheim","Wolfsburg","Göttingen","Bottrop","Reutlingen","Koblenz","Bremerhaven","Recklinghausen",
  "Bergisch Gladbach","Jena","Remscheid","Erlangen","Moers","Trier","Salzgitter","Siegen","Gütersloh","Hildesheim",
  "Cottbus","Kaiserslautern","Gera","Witten","Zwickau","Iserlohn","Schwerin","Düren","Ratingen","Lünen",
  "Flensburg","Villingen-Schwenningen","Marl","Konstanz","Worms","Velbert","Minden","Neumünster","Norderstedt","Delmenhorst",
  "Bamberg","Bayreuth","Aschaffenburg","Landshut","Kempten","Rosenheim","Schweinfurt","Passau","Friedrichshafen","Ravensburg",
  "Wien","Graz","Linz","Salzburg","Innsbruck","Klagenfurt","Villach","Wels","Sankt Pölten","Dornbirn",
  "Wiener Neustadt","Steyr","Feldkirch","Bregenz","Leonding","Klosterneuburg","Baden bei Wien","Wolfsberg","Krems","Kufstein",
  "Zürich","Genf","Basel","Bern","Lausanne","Winterthur","Luzern","Sankt Gallen","Lugano","Biel",
  "Thun","Köniz","La Chaux-de-Fonds","Freiburg (CH)","Schaffhausen","Chur","Neuenburg","Vernier","Uster","Sitten",
];

const UA_OSM = "ai-company-os-lead-discovery/0.1 (agent-swarm research)";

/** Geocode a place name to a bbox via Nominatim, cached on disk (1 req/s). */
/** timeout signal, plus an optional caller signal (stop) — fetch aborts on
 * whichever fires first, so Stop kills an in-flight request immediately. */
function reqSignal(ms: number, extra?: AbortSignal): AbortSignal {
  const t = AbortSignal.timeout(ms);
  return extra ? AbortSignal.any([t, extra]) : t;
}

async function geocodeBbox(
  companyDir: string,
  place: string,
  signal?: AbortSignal
): Promise<[number, number, number, number] | null> {
  const cacheFile = path.join(companyDir, "data", ".geocache.json");
  const cache = (() => {
    try {
      return JSON.parse(fs.readFileSync(cacheFile, "utf8")) as Record<string, [number, number, number, number] | null>;
    } catch {
      return {} as Record<string, [number, number, number, number] | null>;
    }
  })();
  if (place in cache) return cache[place];
  await new Promise((r) => setTimeout(r, 1100)); // Nominatim: ≤1 req/s
  if (signal?.aborted) return null;
  let box: [number, number, number, number] | null = null;
  try {
    const res = await fetch(
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(place),
      { signal: reqSignal(20_000, signal), headers: { "user-agent": UA_OSM } }
    );
    const arr = (await res.json()) as { boundingbox?: [string, string, string, string] }[];
    const bb = arr[0]?.boundingbox;
    if (bb) box = [Number(bb[0]), Number(bb[2]), Number(bb[1]), Number(bb[3])]; // s,w,n,e
  } catch {}
  cache[place] = box;
  ensureDir(path.dirname(cacheFile));
  fs.writeFileSync(cacheFile, JSON.stringify(cache));
  return box;
}

/** Real businesses matching the given OSM tag selectors within a city. */
/** Run any Overpass QL against the public mirrors, mapping tagged elements to
 * business rows. Used by the per-city selector path AND raw overpassQl. */
async function overpassRaw(ql: string, signal?: AbortSignal, city = ""): Promise<Business[]> {
  for (const host of [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ]) {
    try {
      const res = await fetch(host, {
        method: "POST",
        signal: reqSignal(90_000, signal),
        headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA_OSM },
        body: "data=" + encodeURIComponent(ql),
      });
      const txt = await res.text();
      if (!txt.trimStart().startsWith("{")) continue; // rate-limited / error page
      const els = (JSON.parse(txt).elements ?? []) as { tags?: Record<string, string> }[];
      return els
        .map((el) => el.tags ?? {})
        .filter((t) => t.name)
        .map((t) => ({
          name: t.name,
          website: (t.website || t["contact:website"] || "").trim(),
          email: (t.email || t["contact:email"] || "").trim(),
          phone: (t.phone || t["contact:phone"] || "").trim(),
          city: (t["addr:city"] || city || "").trim(),
        }));
    } catch {
      // try next mirror
    }
  }
  return [];
}

async function overpassBusinesses(
  companyDir: string,
  city: string,
  selectors: string[],
  signal?: AbortSignal
): Promise<Business[]> {
  const bbox = await geocodeBbox(companyDir, city, signal);
  if (!bbox) return [];
  const [s, w, n, e] = bbox;
  const q =
    `[out:json][timeout:50];(` +
    selectors.map((sel) => `nwr[${sel}](${s},${w},${n},${e});`).join("") +
    `);out tags 800;`;
  const rows = await overpassRaw(q, signal, city);
  // per-city sweep: stamp the sweep city so auto-sweep bookkeeping stays exact
  return rows.map((r) => ({ ...r, city }));
}

export const discoverTool: Tool = {
  name: "discover",
  doc:
    "discover — find REAL businesses from OpenStreetMap and write them straight into a table " +
    "(name, website, email, phone, city — deduped, nothing invented). " +
    "You MUST say what KIND of business via trades or segment: handwerk e.g. trades:[\"SHK\",\"Elektro\",\"Dachdecker\"], " +
    'or recruitment e.g. segment:"recruitment" (also staffing/executive-search). It refuses if it can\'t tell — it will NOT guess. ' +
    'args: {"trades": ["SHK"], "segment": "recruitment", "into": "firms", "db": "main.db", "country": "DE"}. ' +
    "EASIEST: omit cities — discover auto-sweeps a built-in list of ~150 DACH cities, skipping ones already in the " +
    "table, so just call it again and again until the region is exhausted. (Or pass your own \"cities\": [..].) " +
    "Returns NEW rows + table total. (For web-search discovery instead, pass {\"queries\": [\"...\"]}.)",
  async run(ctx, args) {
    const table = str(args.into) || "maps_raw";
    if (!/^[A-Za-z_][\w]*$/.test(table)) throw new Error("into must be a table name");
    const dbName = str(args.db) || "main.db";
    if (!/^[\w.-]+$/.test(dbName)) throw new Error("db must be a plain filename");
    const seg = str(args.segment);
    const country = str(args.country);

    let cities = Array.isArray(args.cities)
      ? (args.cities as unknown[]).map(String).filter(Boolean)
      : [];
    // AUTO-SWEEP: no explicit cities (and not a web-query call) → walk the
    // built-in DACH list, skipping cities already present in the table so every
    // call hits NEW ground. This is what lets a target actually climb to 10000
    // instead of re-scraping the same 20 cities forever.
    const wantWeb = Array.isArray(args.queries) || str(args.query);
    const overpassQl = str(args.overpassQl);
    if (!cities.length && !wantWeb && !overpassQl) {
      const dbPath = safePath(ctx.company.dir, path.join("data", dbName));
      const swept = new Set<string>();
      if (fs.existsSync(dbPath)) {
        try {
          const db = new DatabaseSync(dbPath);
          const hasCity = (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).some(
            (c) => c.name === "city"
          );
          if (hasCity) {
            for (const r of db.prepare(`SELECT DISTINCT city FROM "${table}" WHERE city IS NOT NULL`).all() as {
              city: string;
            }[])
              swept.add(r.city);
          }
          db.close();
        } catch {}
      }
      // small batch = a discover call finishes in ~1 min, so Stop is responsive
      // and the row count updates often; the continue-gate calls it again anyway
      cities = DACH_CITIES.filter((c) => !swept.has(c)).slice(0, 8);
      if (!cities.length) {
        return `discover: all ${DACH_CITIES.length} built-in DACH cities already swept into ${table} — the region is exhausted for this trade set. Report the honest total to the owner.`;
      }
    }
    const trades = Array.isArray(args.trades)
      ? (args.trades as unknown[]).map((t) => String(t).toLowerCase())
      : [];

    // Resolve WHICH kind of business to look for on OSM. If we can't tell,
    // REFUSE rather than silently returning handwerk (the old bug that filled a
    // recruitment company with plumbers). Only matters for the tag-based OSM
    // path — a raw overpassQl query IS the specification.
    const wantOsm = cities.length > 0 && !overpassQl;
    const category = wantOsm ? resolveOsmSelectors(trades, seg) : null;
    if (wantOsm && !category) {
      throw new Error(
        `discover: can't tell what kind of business to find from trades=[${trades.join(",")}] segment="${seg}". ` +
          `Pass trades for handwerk (e.g. ["SHK","Elektro"]) or a recognized segment like "recruitment"/"staffing". ` +
          `I will not guess — otherwise you'd get the wrong businesses.`
      );
    }

    const rows: Business[] = [];
    let source = "";

    let stopped = false;
    // abort in-flight HTTP the moment Stop is requested (not just between cities)
    const ac = new AbortController();
    const stopPoll = ctx.shouldStop
      ? setInterval(() => {
          if (ctx.shouldStop?.()) ac.abort();
        }, 400)
      : null;
    try {
    if (overpassQl) {
      // power path: run a raw Overpass QL query verbatim (test it on
      // overpass-turbo.eu first — see the overpass-osm skill)
      source = "overpass-ql";
      if (!/\[\s*out\s*:\s*json\s*\]/i.test(overpassQl)) {
        throw new Error('overpassQl must start with [out:json] (test your query on overpass-turbo.eu first)');
      }
      rows.push(...(await overpassRaw(overpassQl, ac.signal)));
    } else if (cities.length) {
      // primary: OpenStreetMap local-business discovery. Stop is checked
      // between cities AND aborts the current fetch, so it lands in <1s; any
      // rows collected so far are still written below (no lost work).
      source = "osm";
      for (const city of cities.slice(0, 20)) {
        if (ctx.shouldStop?.() || ac.signal.aborted) { stopped = true; break; }
        rows.push(...(await overpassBusinesses(ctx.company.dir, city, category!.selectors, ac.signal)));
      }
    } else {
      // fallback: web search by query (domains only)
      source = "web";
      const queries = Array.isArray(args.queries)
        ? (args.queries as unknown[]).map(String).filter(Boolean)
        : str(args.query)
          ? [str(args.query)]
          : [];
      if (!queries.length) throw new Error('provide cities: [..] (or queries: [..])');
      for (const q of queries.slice(0, 25)) {
        if (ctx.shouldStop?.()) { stopped = true; break; }
        for (const d of await ddgDomains(q)) {
          rows.push({ name: d.title || d.host, website: d.url, email: "", phone: "", city: "" });
        }
      }
    }
    } finally {
      if (stopPoll) clearInterval(stopPoll);
    }
    // drop category-excluded names (e.g. public job centres for recruitment)
    let excluded = 0;
    if (category?.exclude) {
      const re = category.exclude;
      const kept = rows.filter((r) => !re.test(r.name));
      excluded = rows.length - kept.length;
      rows.length = 0;
      rows.push(...kept);
    }
    if (!rows.length) {
      return stopped
        ? "discover: stopped by owner before any rows were collected."
        : `discover: 0 businesses found (${source}). Try different/larger cities or check connectivity.`;
    }

    const w = writeBusinesses(ctx.company.dir, dbName, table, rows, seg, country, source);
    if (stopped) {
      return `discover(${source}): STOPPED by owner mid-sweep — ${w.added} NEW rows written before stopping (table now ${w.total}). Partial progress saved.`;
    }
    return (
      `discover(${source}): ${rows.length} businesses found${cities.length ? ` across ${cities.length} cities` : ""} → ` +
      `${w.added} NEW rows in ${table} (${w.withEmail} had an email, ${w.skipped} duplicates skipped; table now ${w.total}). ` +
      `Keep calling with DIFFERENT cities/trades until the target is met.`
    );
  },
};

/** Shared, SCHEMA-INDEPENDENT deduped insert. Dedup is done in app code against
 * the rows already in the table (by website domain AND by lower(name)|city), so
 * it works even when an agent pre-created the table without a UNIQUE column —
 * the bug that once produced ~5k duplicate rows. */
function writeBusinesses(
  companyDir: string,
  dbName: string,
  table: string,
  rows: Business[],
  seg: string,
  country: string,
  source: string
): { added: number; total: number; withEmail: number; skipped: number } {
  const dbPath = safePath(companyDir, path.join("data", dbName));
  ensureDir(path.dirname(dbPath));
  const db = new DatabaseSync(dbPath);
  let added = 0;
  let total = 0;
  let withEmail = 0;
  let skipped = 0;
  const domainOf = (website: string): string => {
    try {
      return website ? new URL(website).hostname.replace(/^www\./, "").toLowerCase() : "";
    } catch {
      return "";
    }
  };
  const nameKey = (name: string, city: string) =>
    (name || "").trim().toLowerCase() + "|" + (city || "").trim().toLowerCase();
  try {
    db.exec(
      `CREATE TABLE IF NOT EXISTS "${table}" (id INTEGER PRIMARY KEY, name TEXT, website TEXT, email TEXT, phone TEXT, city TEXT, segment TEXT, country TEXT, source TEXT, uniq TEXT UNIQUE)`
    );
    const cols = new Set(
      (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((c) => c.name)
    );
    const has = (c: string) => cols.has(c);
    // existing keys — the ground truth for dedup, regardless of schema
    const seenDomains = new Set<string>();
    const seenNames = new Set<string>();
    const sel = ["name", has("website") ? "website" : "NULL AS website", has("city") ? "city" : "NULL AS city"];
    for (const r of db.prepare(`SELECT ${sel.join(", ")} FROM "${table}"`).all() as {
      name: string; website: string | null; city: string | null;
    }[]) {
      const d = domainOf(r.website ?? "");
      if (d) seenDomains.add(d);
      seenNames.add(nameKey(r.name ?? "", r.city ?? ""));
    }
    const before = (db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }).n;
    const baseFields = ["name", "website", "email", "phone", "city", "segment", "country", "source", "uniq"];
    const extraKeys = new Set<string>();
    for (const b of rows) {
      if (b.extra) for (const k of Object.keys(b.extra)) if (has(k)) extraKeys.add(k);
    }
    if (source.startsWith("import:") && has("discovery_source")) extraKeys.add("discovery_source");
    if (has("canonical_domain")) extraKeys.add("canonical_domain");
    const fields = [...baseFields.filter(has), ...[...extraKeys].filter((k) => !baseFields.includes(k))];
    const ins = db.prepare(
      `INSERT OR IGNORE INTO "${table}" (${fields.map((f) => `"${f}"`).join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`
    );
    for (const b of rows) {
      const domain = domainOf(b.website);
      const nkey = nameKey(b.name, b.city);
      if ((domain && seenDomains.has(domain)) || seenNames.has(nkey)) {
        skipped++;
        continue;
      }
      if (domain) seenDomains.add(domain);
      seenNames.add(nkey);
      if (b.email) withEmail++;
      const uniq = (domain || nkey).toLowerCase();
      const map: Record<string, unknown> = {
        name: b.name, website: b.website || null, email: b.email || null, phone: b.phone || null,
        city: b.city || null, segment: seg || null, country: country || null, source, uniq,
      };
      if (b.extra) {
        for (const [k, v] of Object.entries(b.extra)) {
          if (has(k) && v) map[k] = v;
        }
      }
      if (source.startsWith("import:") && has("discovery_source") && !map.discovery_source) {
        map.discovery_source = "upload";
      }
      if (has("canonical_domain") && domain && !map.canonical_domain) {
        map.canonical_domain = domain;
      }
      ins.run(...(fields.map((f) => map[f] ?? null) as never[]));
    }
    total = (db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }).n;
    added = total - before;
  } finally {
    db.close();
  }
  return { added, total, withEmail, skipped };
}

/** Parse an overpass-turbo.eu export (raw OSM JSON, GeoJSON, or CSV) into
 * normalized business rows. Throws on unrecognized formats — no guessing. */
export function parseBusinessFile(content: string, filename: string): Business[] {
  const tagRow = (t: Record<string, string>): Business | null => {
    const name = t.name ?? t["@name"] ?? "";
    if (!name) return null;
    return {
      name,
      website: repairUrl(t.website || t["contact:website"] || t.url || ""),
      email: (t.email || t["contact:email"] || "").trim(),
      phone: (t.phone || t["contact:phone"] || "").trim(),
      city: (t["addr:city"] || t.city || "").trim(),
    };
  };
  const trimmed = content.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const j = JSON.parse(content) as Record<string, unknown>;
    // raw overpass JSON: {elements:[{tags:{...}}]}
    if (Array.isArray((j as { elements?: unknown[] }).elements)) {
      return ((j as { elements: { tags?: Record<string, string> }[] }).elements)
        .map((e) => (e.tags ? tagRow(e.tags) : null))
        .filter((b): b is Business => !!b);
    }
    // GeoJSON: {features:[{properties:{...}}]}
    if (Array.isArray((j as { features?: unknown[] }).features)) {
      return ((j as { features: { properties?: Record<string, string> }[] }).features)
        .map((f) => (f.properties ? tagRow(f.properties) : null))
        .filter((b): b is Business => !!b);
    }
    throw new Error(`unrecognized JSON structure in ${filename} — expected overpass "elements" or GeoJSON "features"`);
  }
  // CSV with a header row (overpass-turbo CSV export; comma, semicolon, or tab)
  const rows = parseCsv(content);
  if (rows.length < 2) throw new Error(`no data rows in ${filename}`);
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/^@/, ""));
  const col = (names: string[], r: string[]): string => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) {
        const v = (r[i] ?? "").trim();
        if (v) return v;
      }
    }
    return "";
  };
  const iName = header.findIndex((h) => h === "name");
  if (iName === -1) throw new Error(`CSV ${filename} has no "name" column (headers: ${header.join(", ")})`);
  return rows.slice(1)
    .map((r): Business | null => {
      const name = (r[iName] ?? "").trim();
      if (!name) return null;
      const extra: Record<string, string> = {};
      const craft = col(["craft", "trade"], r);
      if (craft) extra.trade = craft;
      const tradeCat = col(["trade_category", "trade-category", "category"], r);
      if (tradeCat) extra.trade_category = tradeCat;
      const street = col(["addr:street", "street"], r);
      const house = col(["addr:housenumber", "housenumber", "house_number"], r);
      const post = col(["addr:postcode", "postcode", "zip", "postal_code"], r);
      const city = col(["addr:city", "city"], r);
      const address = [street && house ? `${street} ${house}` : street || house, post, city]
        .filter(Boolean)
        .join(", ");
      if (address) extra.address = address;
      return {
        name,
        website: repairUrl(col(["website", "contact:website", "url"], r)),
        email: col(["email", "contact:email"], r),
        phone: col(["phone", "contact:phone"], r),
        city,
        extra: Object.keys(extra).length ? extra : undefined,
      };
    })
    .filter((b): b is Business => b !== null);
}

/** Prefer the delimiter that best splits the header into multiple columns. */
function detectCsvDelim(headerLine: string): string {
  const semi = (headerLine.match(/;/g) || []).length;
  const comma = (headerLine.match(/,/g) || []).length;
  const tab = (headerLine.match(/\t/g) || []).length;
  if (tab > 0 && tab >= semi && tab >= comma) return "\t";
  if (semi >= comma && semi > 0) return ";";
  return ",";
}

/** Minimal RFC-4180-ish CSV parser (quoted fields, embedded commas/newlines).
 * Delimiter is auto-detected from the first line (comma, semicolon, or tab). */
function parseCsv(text: string): string[][] {
  const firstLineEnd = (() => {
    let inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (inQ && text[i + 1] === '"') { i++; continue; }
        inQ = !inQ;
      } else if (!inQ && (c === "\n" || c === "\r")) return i;
    }
    return text.length;
  })();
  const delim = detectCsvDelim(text.slice(0, firstLineEnd));
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

export const importdataTool: Tool = {
  name: "importdata",
  doc:
    "importdata — bulk-import an uploaded overpass-turbo/OSM export (JSON, GeoJSON or CSV — comma, semicolon, or tab) " +
    "from the company's data/ folder straight into a table. Parsing and insert are deterministic (no LLM rewrite). " +
    "Maps name/website/email/phone/city plus craft→trade and address fields when the table has those columns; " +
    "dedupes by website domain and name|city. Do NOT read+rewrite large uploads first — call this on the original path. " +
    'args: {"path": "data/uploads/export.csv", "into": "firms", "db": "main.db", "segment": "recruitment", "country": "DE"}. ' +
    "Returns rows parsed, NEW rows added, duplicates skipped, and the table total.",
  async run(ctx, args) {
    const rel = str(args.path);
    const full = safePath(ctx.company.dir, rel);
    if (!fs.existsSync(full)) throw new Error(`no such file: ${rel} — check data/uploads/`);
    const table = str(args.into) || "firms";
    if (!/^[A-Za-z_][\w]*$/.test(table)) throw new Error("into must be a table name");
    const dbName = str(args.db) || "main.db";
    if (!/^[\w.-]+$/.test(dbName)) throw new Error("db must be a plain filename");
    const st = fs.statSync(full);
    const rows = parseBusinessFile(fs.readFileSync(full, "utf8"), rel);
    if (!rows.length) return `importdata: ${rel} (${st.size} B) parsed but contained 0 named businesses`;
    const w = writeBusinesses(ctx.company.dir, dbName, table, rows, str(args.segment), str(args.country), "import:" + path.basename(rel));
    return `importdata: ${rows.length} businesses parsed from ${rel} (${st.size} B) → ${w.added} NEW rows in ${table} (${w.withEmail} had an email, ${w.skipped} duplicates skipped; table now ${w.total}).`;
  },
};

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
      const { sendEmail } = await import("./connectors/email.js");
      return await sendEmail(cfg, {
        to: str(args.to),
        subject: str(args.subject),
        body: str(args.body),
        cc: str(args.cc) || undefined,
      });
    }
    if (op === "read") {
      const { pollEmail } = await import("./connectors/email.js");
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
    "Requires connectors.telegram.botTokenEnv. Optionally restrict with allowedChatIds.",
  async run(ctx, args) {
    const cfg = ctx.company.meta.connectors?.telegram;
    if (!cfg?.botTokenEnv) {
      return "error: telegram connector not configured — set company.json connectors.telegram.botTokenEnv";
    }
    const op = str(args.op) || "send";
    if (op === "send") {
      const { sendTelegram } = await import("./connectors/telegram.js");
      return await sendTelegram(cfg, { chatId: str(args.chatId), text: str(args.text) });
    }
    if (op === "read") {
      const { pollTelegram } = await import("./connectors/telegram.js");
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
    const { postWebhook } = await import("./connectors/webhook.js");
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

const ALL: Tool[] = [
  filesystemTool,
  fetchTool,
  sqliteTool,
  searchTool,
  discoverTool,
  importdataTool,
  emailTool,
  telegramTool,
  webhookTool,
];

/** filesystem and sqlite are sandboxed to the company directory — every agent
 * always has them. Profiles only opt agents into NETWORK tools. This kills
 * the "tool filesystem not available" class of failure for good. */
const BASELINE = ["filesystem", "sqlite", "importdata"];

/** Loose names that plans and models produce; resolve instead of erroring. */
export const TOOL_ALIASES: Record<string, string> = {
  browser: "fetch", web: "fetch", http: "fetch", url: "fetch", curl: "fetch",
  read_file: "filesystem", write_file: "filesystem", file: "filesystem",
  files: "filesystem", fs: "filesystem", read: "filesystem", write: "filesystem",
  db: "sqlite", database: "sqlite", sql: "sqlite", sqlite3: "sqlite",
  google: "search", websearch: "search", web_search: "search", duckduckgo: "search",
  mail: "email", smtp: "email", imap: "email",
  tg: "telegram",
  http_post: "webhook", hook: "webhook",
};

export function resolveToolName(name: string): string {
  const n = (name ?? "").toLowerCase().trim();
  return TOOL_ALIASES[n] ?? n;
}

export function toolsFor(names: string[]): Tool[] {
  const wanted = new Set([...BASELINE, ...names.map(resolveToolName)]);
  // discover is the bulk sibling of search — any agent that can search should
  // be able to discover (this is the scaling tool for large lead lists).
  if (wanted.has("search") || wanted.has("fetch")) wanted.add("discover");
  return ALL.filter((t) => wanted.has(t.name));
}

export function allToolNames(): string[] {
  return ALL.map((t) => t.name);
}

export function baselineToolNames(): string[] {
  return [...BASELINE];
}
