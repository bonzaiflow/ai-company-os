import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ensureDir } from "../../util.js";
import type { Business } from "./importdata.js";
import { writeBusinesses } from "./importdata.js";
import type { Tool } from "./types.js";
import { safePath, str } from "./types.js";

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
    label: "consulting",
    match: /consult|beratung|advisory|management.?consult|strategy|unternehmensberat/i,
    selectors: ['"office"="consultant"', '"office"="it"', '"office"="accountant"', '"office"="financial"'],
  },
  {
    label: "marketing/advertising",
    match: /market|advert|werbe|kommunikation|advertising|graphic.?design|marketing.?agenc/i,
    selectors: ['"office"="advertising_agency"', '"office"="graphic_design"', '"office"="marketing"'],
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

/** Tier-1 knowledge-SME geos (NL/DK/SE/FI/IE/LU) + major BE/FR/UK cities for ICP sweeps. */
export const EU_TIER1_CITIES = [
  "Amsterdam","Rotterdam","Den Haag","Utrecht","Eindhoven","Groningen","Tilburg","Almere","Breda","Nijmegen",
  "Apeldoorn","Haarlem","Arnhem","Zaanstad","Amersfoort","Haarlemmermeer","Zwolle","Leiden","Maastricht","Dordrecht",
  "Copenhagen","Aarhus","Odense","Aalborg","Esbjerg","Randers","Kolding","Horsens","Vejle","Roskilde",
  "Stockholm","Göteborg","Malmö","Uppsala","Västerås","Örebro","Linköping","Helsingborg","Jönköping","Norrköping",
  "Lund","Umeå","Gävle","Borås","Södertälje","Eskilstuna","Karlstad","Halmstad","Växjö","Sundsvall",
  "Helsinki","Espoo","Tampere","Vantaa","Oulu","Turku","Jyväskylä","Lahti","Kuopio","Pori",
  "Dublin","Cork","Limerick","Galway","Waterford",
  "Luxembourg","Esch-sur-Alzette",
  "Brussels","Antwerp","Ghent","Bruges","Leuven","Liège",
];

/** City list for knowledge ICPs (consulting / marketing / recruitment): Tier-1 + DACH. */
export const KNOWLEDGE_CITIES = [...EU_TIER1_CITIES, ...DACH_CITIES];

/** ISO3166-1 codes for country-wide Overpass area sweeps (knowledge ICPs).
 * Much denser than city bboxes — use when city auto-sweep is too slow/thin for 10k. */
export const KNOWLEDGE_COUNTRY_CODES = [
  "NL", "DK", "SE", "FI", "IE", "LU", "BE", "DE", "AT", "CH", "GB", "FR",
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

/** Country-wide Overpass via ISO3166-1 area — denser than city bboxes for 10k targets. */
async function overpassCountry(
  iso: string,
  selectors: string[],
  signal?: AbortSignal
): Promise<Business[]> {
  const code = iso.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return [];
  const q =
    `[out:json][timeout:90];` +
    `area["ISO3166-1"="${code}"][admin_level=2]->.a;(` +
    selectors.map((sel) => `nwr[${sel}](area.a);`).join("") +
    `);out tags 5000;`;
  // Prefer real addr:city from OSM; country bookkeeping is via .discover-swept.json
  return overpassRaw(q, signal, "");
}

function readSweptMeta(companyDir: string): { keys: string[] } {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(companyDir, "data", ".discover-swept.json"), "utf8")) as {
      keys?: string[];
      countries?: string[]; // legacy
    };
    const keys = [...(raw.keys ?? []), ...(raw.countries ?? [])];
    return { keys: [...new Set(keys)] };
  } catch {
    return { keys: [] };
  }
}

function markSwept(companyDir: string, key: string): void {
  const meta = readSweptMeta(companyDir);
  if (!meta.keys.includes(key)) meta.keys.push(key);
  ensureDir(path.join(companyDir, "data"));
  fs.writeFileSync(path.join(companyDir, "data", ".discover-swept.json"), JSON.stringify(meta, null, 2));
}

export const discoverTool: Tool = {
  name: "discover",
  doc:
    "discover — find REAL businesses from OpenStreetMap and write them straight into a table " +
    "(name, website, email, phone, city — deduped, nothing invented). " +
    "You MUST say what KIND of business via trades or segment: handwerk e.g. trades:[\"SHK\",\"Elektro\",\"Dachdecker\"], " +
    'or recruitment e.g. segment:"recruitment", consulting e.g. segment:"consulting", marketing e.g. segment:"marketing". ' +
    "It refuses if it can't tell — it will NOT guess. " +
    'args: {"segment": "consulting", "into": "maps_raw", "db": "leads.db", "country": "NL"}. ' +
    "EASIEST: omit cities — discover auto-sweeps built-in cities (knowledge ICPs use Tier-1 EU + DACH; crafts use DACH), skipping ones already in the " +
    "table, so just call it again and again until the region is exhausted. (Or pass your own \"cities\": [..].) " +
    "Returns NEW rows + table total. (For web-search discovery instead, pass {\"queries\": [\"...\"]}.)",
  async run(ctx, args) {
    const table = str(args.into) || "maps_raw";
    if (!/^[A-Za-z_][\w]*$/.test(table)) throw new Error("into must be a table name");
    const dbName = str(args.db) || "main.db";
    if (!/^[\w.-]+$/.test(dbName)) throw new Error("db must be a plain filename");
    const seg = str(args.segment);
    const country = str(args.country);
    const trades = Array.isArray(args.trades)
      ? (args.trades as unknown[]).map((t) => String(t).toLowerCase())
      : [];

    let cities = Array.isArray(args.cities)
      ? (args.cities as unknown[]).map(String).filter(Boolean)
      : [];
    let countries = Array.isArray(args.countries)
      ? (args.countries as unknown[]).map((c) => String(c).toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c))
      : [];
    // AUTO-SWEEP: no explicit cities/countries (and not a web-query call) →
    // for knowledge ICPs prefer country-area sweeps (dense), else walk cities.
    const wantWeb = Array.isArray(args.queries) || str(args.query);
    const overpassQl = str(args.overpassQl);
    const knowledge =
      /recruit|staff|consult|market|advert|beratung|werbe|personal|headhunt/i.test(
        [...trades, seg].join(" ")
      );
    if (!cities.length && !countries.length && !wantWeb && !overpassQl) {
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
      if (knowledge) {
        // one country×category per call — Overpass area queries are heavy
        const catKey = (resolveOsmSelectors(trades, seg)?.label || seg || "unknown").replace(/\W+/g, "_");
        const already = new Set(readSweptMeta(ctx.company.dir).keys);
        countries = KNOWLEDGE_COUNTRY_CODES.filter((c) => !already.has(`${catKey}:${c}`)).slice(0, 1);
        if (!countries.length) {
          // fall back to remaining city pool after countries exhausted
          cities = KNOWLEDGE_CITIES.filter((c) => !swept.has(c)).slice(0, 8);
          if (!cities.length) {
            return `discover: all ${KNOWLEDGE_COUNTRY_CODES.length} knowledge countries and ${KNOWLEDGE_CITIES.length} cities already swept into ${table} — region exhausted. Report the honest total to the owner.`;
          }
        }
      } else {
        const cityPool = DACH_CITIES;
        cities = cityPool.filter((c) => !swept.has(c)).slice(0, 8);
        if (!cities.length) {
          return `discover: all ${cityPool.length} built-in cities already swept into ${table} — the region is exhausted for this trade set. Report the honest total to the owner.`;
        }
      }
    }

    // Resolve WHICH kind of business to look for on OSM. If we can't tell,
    // REFUSE rather than silently returning handwerk (the old bug that filled a
    // recruitment company with plumbers). Only matters for the tag-based OSM
    // path — a raw overpassQl query IS the specification.
    const wantOsm = (cities.length > 0 || countries.length > 0) && !overpassQl;
    const category = wantOsm ? resolveOsmSelectors(trades, seg) : null;
    if (wantOsm && !category) {
      throw new Error(
        `discover: can't tell what kind of business to find from trades=[${trades.join(",")}] segment="${seg}". ` +
          `Pass trades for handwerk (e.g. ["SHK","Elektro"]) or a recognized segment like "recruitment"/"consulting"/"marketing". ` +
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
    } else if (countries.length) {
      source = "osm-country";
      const catKey = (category!.label || seg || "unknown").replace(/\W+/g, "_");
      for (const iso of countries.slice(0, 4)) {
        if (ctx.shouldStop?.() || ac.signal.aborted) { stopped = true; break; }
        rows.push(...(await overpassCountry(iso, category!.selectors, ac.signal)));
        // mark even on partial/empty so we don't hammer the same country forever
        markSwept(ctx.company.dir, `${catKey}:${iso}`);
      }
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
    if (category?.exclude) {
      const re = category.exclude;
      const kept = rows.filter((r) => !re.test(r.name));
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
      `discover(${source}): ${rows.length} businesses found${countries.length ? ` across ${countries.length} countries` : cities.length ? ` across ${cities.length} cities` : ""} → ` +
      `${w.added} NEW rows in ${table} (${w.withEmail} had an email, ${w.skipped} duplicates skipped; table now ${w.total}). ` +
      `Keep calling with DIFFERENT cities/trades until the target is met.`
    );
  },
};
