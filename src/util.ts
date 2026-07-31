import fs from "node:fs";
import path from "node:path";

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "unnamed";
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(file: string, data: unknown): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n… [truncated, ${s.length - max} chars omitted]`;
}

/** Serialize async critical sections (company file writes across parallel ticks). */
export class AsyncMutex {
  private chain: Promise<void> = Promise.resolve();

  run<T>(fn: () => T | Promise<T>): Promise<T> {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prev = this.chain;
    this.chain = prev.then(() => gate);
    return prev.then(async () => {
      try {
        return await fn();
      } finally {
        release();
      }
    });
  }
}

/** Best-effort extraction of a string field while a JSON object is still
 * streaming in. Returns the decoded value so far (may be incomplete). */
export function extractPartialJsonField(text: string, field: string): string | null {
  const cleaned = text.replace(/```(?:json)?/g, "");
  const re = new RegExp(`"${field}"\\s*:\\s*"`);
  const m = re.exec(cleaned);
  if (!m) return null;
  let i = m.index + m[0].length;
  let out = "";
  while (i < cleaned.length) {
    const c = cleaned[i];
    if (c === "\\") {
      const n = cleaned[i + 1];
      if (n === undefined) break;
      const map: Record<string, string> = {
        n: "\n",
        r: "\r",
        t: "\t",
        '"': '"',
        "\\": "\\",
        "/": "/",
      };
      if (n === "u" && /^[0-9a-fA-F]{4}/.test(cleaned.slice(i + 2, i + 6))) {
        out += String.fromCharCode(parseInt(cleaned.slice(i + 2, i + 6), 16));
        i += 6;
        continue;
      }
      out += map[n] ?? n;
      i += 2;
      continue;
    }
    if (c === '"') break;
    out += c;
    i++;
  }
  return out;
}

/** Pull the first balanced JSON object out of possibly-noisy model output. */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/g, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) throw new Error("no JSON object in output");
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === "\\") {
      if (inStr) esc = true;
      continue;
    }
    if (c === '"') inStr = !inStr;
    if (inStr) continue;
    if (c === "{") depth++;
    if (c === "}") {
      depth--;
      if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1));
    }
  }
  throw new Error("unbalanced JSON in output");
}

// ---- minimal frontmatter (key: value lines only, lists as comma-separated) ----

export interface FrontmatterDoc {
  meta: Record<string, string>;
  body: string;
}

export function parseFrontmatter(raw: string): FrontmatterDoc {
  if (!raw.startsWith("---")) return { meta: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { meta: {}, body: raw };
  const head = raw.slice(3, end).trim();
  const body = raw.slice(raw.indexOf("\n", end + 1) + 1);
  const meta: Record<string, string> = {};
  for (const line of head.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { meta, body };
}

export function serializeFrontmatter(meta: Record<string, string>, body: string): string {
  const head = Object.entries(meta)
    .map(([k, v]) => `${k}: ${(v ?? "").replace(/\n/g, " ")}`)
    .join("\n");
  return `---\n${head}\n---\n\n${body.trimStart()}`;
}

// ---- tiny ANSI helpers (zero-dep terminal color) ----

const tty = process.stdout.isTTY;
const wrap = (open: number, close: number) => (s: string) =>
  tty ? `\x1b[${open}m${s}\x1b[${close}m` : s;

export const c = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
};
