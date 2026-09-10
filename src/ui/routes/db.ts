import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadConfig } from "../../config.js";
import { Company } from "../../core/store.js";
import { createProvider } from "../../llm/index.js";
import { resolveHelperLlm } from "../../llm/resolve.js";
import { json, readBody } from "../http.js";
import type { RouteHandler } from "./types.js";

/** /api/db/* — read-only sqlite browser, CSV export, NL→SQL. */
export const handleDbRoutes: RouteHandler = async ({ root, req, res, url }) => {
  if (req.method === "GET" && url.pathname === "/api/db/list") {
    const co = Company.open(root, url.searchParams.get("company") ?? "");
    const dir = path.join(co.dir, "data");
    const out: {
      db: string;
      bytes: number;
      tables: { name: string; rows: number; columns: string[] }[];
    }[] = [];
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (!/\.(db|sqlite|sqlite3)$/i.test(f)) continue;
        try {
          const bytes = fs.statSync(path.join(dir, f)).size;
          // read-only: opening the loop's live DB must never risk a write lock
          const db = new DatabaseSync(path.join(dir, f), { readOnly: true });
          const tables = (
            db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]
          ).map((t) => {
            const n = db.prepare(`SELECT COUNT(*) AS n FROM "${t.name}"`).get() as { n: number };
            const cols = (db.prepare(`PRAGMA table_info("${t.name}")`).all() as { name: string }[]).map(
              (c) => c.name
            );
            return { name: t.name, rows: n.n, columns: cols };
          });
          db.close();
          out.push({ db: f, bytes, tables });
        } catch {}
      }
    }
    json(res, out);
    return true;
  }

  // paginated / sorted / filtered read of one table (read-only, safe on a
  // DB another process is writing). params: db, table, page, pageSize,
  // sort, dir, q (global text search), and f_<col>=<substr> column filters.
  if (req.method === "GET" && url.pathname === "/api/db/table") {
    const co = Company.open(root, url.searchParams.get("company") ?? "");
    const dbName = url.searchParams.get("db") ?? "";
    const table = url.searchParams.get("table") ?? "";
    if (!/^[\w.-]+$/.test(dbName)) {
      json(res, { error: "invalid db name" }, 400);
      return true;
    }
    const dbPath = path.join(co.dir, "data", dbName);
    if (!fs.existsSync(dbPath)) {
      json(res, { error: "no such database" }, 404);
      return true;
    }
    let db: InstanceType<typeof DatabaseSync> | null = null;
    try {
      db = new DatabaseSync(dbPath, { readOnly: true });
      // validate identifiers against the real schema (no injection via names)
      const tableNames = (
        db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
      ).map((t) => t.name);
      if (!tableNames.includes(table)) {
      json(res, { error: "no such table" }, 404);
      return true;
    }
      const cols = (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map(
        (c) => c.name
      );
      const colSet = new Set(cols);

      const pageSize = Math.min(500, Math.max(10, Number(url.searchParams.get("pageSize")) || 50));
      const page = Math.max(0, Number(url.searchParams.get("page")) || 0);
      const sort = url.searchParams.get("sort") ?? "";
      const dir = url.searchParams.get("dir") === "desc" ? "DESC" : "ASC";
      const q = (url.searchParams.get("q") ?? "").trim();

      // WHERE from per-column filters (f_<col>) + global q across all columns
      const where: string[] = [];
      const params: unknown[] = [];
      for (const [k, v] of url.searchParams) {
        if (!k.startsWith("f_") || !v) continue;
        const col = k.slice(2);
        if (!colSet.has(col)) continue;
        where.push(`"${col}" LIKE ?`);
        params.push(`%${v}%`);
      }
      if (q) {
        where.push("(" + cols.map((c) => `CAST("${c}" AS TEXT) LIKE ?`).join(" OR ") + ")");
        cols.forEach(() => params.push(`%${q}%`));
      }
      const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
      const orderSql = sort && colSet.has(sort) ? ` ORDER BY "${sort}" ${dir}` : "";

      const total = (
        db.prepare(`SELECT COUNT(*) AS n FROM "${table}"${whereSql}`).get(...(params as never[])) as {
          n: number;
        }
      ).n;
      const rows = db
        .prepare(`SELECT * FROM "${table}"${whereSql}${orderSql} LIMIT ? OFFSET ?`)
        .all(...([...params, pageSize, page * pageSize] as never[])) as Record<string, unknown>[];

      json(res, {
        columns: cols,
        rows: rows.map((r) => cols.map((c) => r[c])),
        total,
        page,
        pageSize,
        pages: Math.max(1, Math.ceil(total / pageSize)),
      });
    } catch (e) {
      json(res, { error: (e as Error).message }, 400);
    } finally {
      db?.close();
    }
    return true;
  }

  // CSV export of a table with the same filters/sort as /api/db/table (no pagination).
  if (req.method === "GET" && url.pathname === "/api/db/export") {
    const co = Company.open(root, url.searchParams.get("company") ?? "");
    const dbName = url.searchParams.get("db") ?? "";
    const table = url.searchParams.get("table") ?? "";
    if (!/^[\w.-]+$/.test(dbName)) {
      json(res, { error: "invalid db name" }, 400);
      return true;
    }
    if (!/^[A-Za-z_][\w]*$/.test(table)) {
      json(res, { error: "invalid table name" }, 400);
      return true;
    }
    const dbPath = path.join(co.dir, "data", dbName);
    if (!fs.existsSync(dbPath)) {
      json(res, { error: "no such database" }, 404);
      return true;
    }
    let db: InstanceType<typeof DatabaseSync> | null = null;
    try {
      db = new DatabaseSync(dbPath, { readOnly: true });
      const tableNames = (
        db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
      ).map((t) => t.name);
      if (!tableNames.includes(table)) {
      json(res, { error: "no such table" }, 404);
      return true;
    }
      const cols = (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map(
        (c) => c.name
      );
      const colSet = new Set(cols);
      const sort = url.searchParams.get("sort") ?? "";
      const dir = url.searchParams.get("dir") === "desc" ? "DESC" : "ASC";
      const q = (url.searchParams.get("q") ?? "").trim();
      const where: string[] = [];
      const params: unknown[] = [];
      for (const [k, v] of url.searchParams) {
        if (!k.startsWith("f_") || !v) continue;
        const col = k.slice(2);
        if (!colSet.has(col)) continue;
        where.push(`"${col}" LIKE ?`);
        params.push(`%${v}%`);
      }
      if (q) {
        where.push("(" + cols.map((c) => `CAST("${c}" AS TEXT) LIKE ?`).join(" OR ") + ")");
        cols.forEach(() => params.push(`%${q}%`));
      }
      const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
      const orderSql = sort && colSet.has(sort) ? ` ORDER BY "${sort}" ${dir}` : "";
      const EXPORT_CAP = 100_000;
      const rows = db
        .prepare(`SELECT * FROM "${table}"${whereSql}${orderSql} LIMIT ?`)
        .all(...([...params, EXPORT_CAP] as never[])) as Record<string, unknown>[];

      const esc = (v: unknown): string => {
        if (v === null || v === undefined) return "";
        const s = String(v);
        if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const lines = [cols.map(esc).join(",")];
      for (const r of rows) lines.push(cols.map((c) => esc(r[c])).join(","));
      const csv = lines.join("\n") + "\n";
      const safeTable = table.replace(/[^\w.-]+/g, "_");
      const safeDb = dbName.replace(/[^\w.-]+/g, "_");
      res.writeHead(200, {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${safeDb}-${safeTable}.csv"`,
        "cache-control": "no-store",
      });
      res.end(csv);
    } catch (e) {
      json(res, { error: (e as Error).message }, 400);
    } finally {
      db?.close();
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/db/query") {
    const body = await readBody(req);
    const co = Company.open(root, String(body.company ?? ""));
    const dbName = String(body.db ?? "");
    if (!/^[\w.-]+$/.test(dbName)) {
      json(res, { error: "invalid db name" }, 400);
      return true;
    }
    const dbPath = path.join(co.dir, "data", dbName);
    if (!fs.existsSync(dbPath)) {
      json(res, { error: `no such database ${dbName}` }, 404);
      return true;
    }
    const sql = String(body.sql ?? "").trim();
    if (!/^\s*(select|pragma|with|explain)/i.test(sql)) {
      json(res, { error: "read-only browser: only SELECT / PRAGMA / WITH queries" }, 400);
      return true;
    }
    try {
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const rows = db.prepare(sql).all() as Record<string, unknown>[];
      db.close();
      const limited = rows.slice(0, 200);
      const columns = limited.length ? Object.keys(limited[0]) : [];
      json(res, {
        columns,
        rows: limited.map((r) => columns.map((c) => r[c])),
        total: rows.length,
        truncated: rows.length > 200,
      });
    } catch (e) {
      json(res, { error: (e as Error).message }, 400);
    }
    return true;
  }

  // Natural-language → read-only SQL (execution model, else agents).
  if (req.method === "POST" && url.pathname === "/api/db/prompt") {
    const body = await readBody(req);
    const co = Company.open(root, String(body.company ?? ""));
    const dbName = String(body.db ?? "");
    const prompt = String(body.prompt ?? "").trim();
    const focusTable = String(body.table ?? "").trim();
    if (!prompt) {
      json(res, { error: "prompt required" }, 400);
      return true;
    }
    if (!/^[\w.-]+$/.test(dbName)) {
      json(res, { error: "invalid db name" }, 400);
      return true;
    }
    const dbPath = path.join(co.dir, "data", dbName);
    if (!fs.existsSync(dbPath)) {
      json(res, { error: `no such database ${dbName}` }, 404);
      return true;
    }

    let schemaText = "";
    try {
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const tables = (
        db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
          name: string;
        }[]
      ).map((t) => t.name);
      const lines: string[] = [];
      for (const name of tables) {
        const cols = db.prepare(`PRAGMA table_info("${name}")`).all() as {
          name: string;
          type: string;
          notnull: number;
          pk: number;
        }[];
        const colDesc = cols
          .map((c) => {
            const bits = [c.name, c.type || "ANY"];
            if (c.pk) bits.push("PK");
            if (c.notnull) bits.push("NOT NULL");
            return bits.join(" ");
          })
          .join(", ");
        lines.push(`- ${name} (${colDesc})`);
      }
      db.close();
      schemaText = lines.length ? lines.join("\n") : "(no tables)";
    } catch (e) {
      json(res, { error: (e as Error).message }, 400);
      return true;
    }

    const cfg = loadConfig(root);
    const meta = co.meta;
    const resolved = resolveHelperLlm(cfg, meta);
    let provider;
    try {
      provider = createProvider(cfg, resolved.provider, resolved.model);
    } catch (e) {
      json(res, { error: (e as Error).message }, 400);
      return true;
    }

    const system =
      "You write SQLite read-only queries for a data browser.\n" +
      "Rules:\n" +
      "- Reply with ONLY one SQL statement. No prose, no markdown fences, no comments.\n" +
      "- Allowed: SELECT, WITH (CTE), PRAGMA, EXPLAIN. Never write/modify data.\n" +
      "- Use double-quoted identifiers when needed. Prefer LIMIT 50 unless the user asks otherwise.\n" +
      "- Stick to the schema below; do not invent tables or columns.\n" +
      (focusTable ? `- The user is currently viewing table "${focusTable}". Prefer it when relevant.\n` : "") +
      `\nDatabase file: ${dbName}\nSchema:\n${schemaText}`;

    try {
      const result = await provider.chat([
        { role: "system", content: system },
        { role: "user", content: prompt },
      ]);
      let sql = String(result.content ?? "").trim();
      const fence = sql.match(/```(?:sql|sqlite)?\s*([\s\S]*?)```/i);
      if (fence) sql = fence[1].trim();
      sql = sql.replace(/;+\s*$/, "").trim();
      if (!/^\s*(select|pragma|with|explain)/i.test(sql)) {
        json(
          res,
          {
            error: "model did not return a read-only query",
            raw: String(result.content ?? "").slice(0, 500),
          },
          400
        );
        return true;
      }
      json(res, {
        sql,
        role: resolved.roleKind,
        provider: provider.name,
        model: provider.model,
      });
    } catch (e) {
      json(res, { error: (e as Error).message }, 500);
    }
    return true;
  }

  return false;
};
