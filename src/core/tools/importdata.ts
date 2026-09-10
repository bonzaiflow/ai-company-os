import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ensureDir } from "../../util.js";
import { repairUrl } from "./web.js";
import type { Tool } from "./types.js";
import { safePath, str } from "./types.js";

export interface Business {
  name: string;
  website: string;
  email: string;
  phone: string;
  city: string;
  /** Extra columns to fill when the target table already has them (trade, address, …). */
  extra?: Record<string, string>;
}

/** Shared, SCHEMA-INDEPENDENT deduped insert. Dedup is done in app code against
 * the rows already in the table (by website domain AND by lower(name)|city), so
 * it works even when an agent pre-created the table without a UNIQUE column —
 * the bug that once produced ~5k duplicate rows. */
export function writeBusinesses(
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
