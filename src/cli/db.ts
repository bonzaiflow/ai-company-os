import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import { c } from "../util.js";
import {
  companyOption,
  fail,
  openCompany,
  out,
  wantJson,
  withJson,
  type CliCtx,
} from "./helpers.js";

function openDb(co: ReturnType<typeof openCompany>, dbName: string): InstanceType<typeof DatabaseSync> {
  if (!/^[\w.-]+$/.test(dbName)) fail("invalid db name");
  const dbPath = path.join(co.dir, "data", dbName);
  if (!fs.existsSync(dbPath)) fail(`no such database ${dbName}`);
  return new DatabaseSync(dbPath, { readOnly: true });
}

export function registerDbCommands(program: Command, ctx: CliCtx): void {
  const db = program.command("db").description("read-only SQLite browser (list / table / query / export)");

  withJson(
    companyOption(
      db
        .command("list")
        .description("list databases and tables under data/")
        .action((opts) => {
          const co = openCompany(ctx, opts.company);
          const dir = path.join(co.dir, "data");
          const databases: {
            db: string;
            bytes: number;
            tables: { name: string; rows: number; columns: string[] }[];
          }[] = [];
          if (fs.existsSync(dir)) {
            for (const f of fs.readdirSync(dir)) {
              if (!/\.(db|sqlite|sqlite3)$/i.test(f)) continue;
              try {
                const bytes = fs.statSync(path.join(dir, f)).size;
                const handle = new DatabaseSync(path.join(dir, f), { readOnly: true });
                const tables = (
                  handle.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
                    name: string;
                  }[]
                ).map((t) => {
                  const n = handle.prepare(`SELECT COUNT(*) AS n FROM "${t.name}"`).get() as { n: number };
                  const cols = (handle.prepare(`PRAGMA table_info("${t.name}")`).all() as { name: string }[]).map(
                    (c) => c.name
                  );
                  return { name: t.name, rows: n.n, columns: cols };
                });
                handle.close();
                databases.push({ db: f, bytes, tables });
              } catch {
                /* skip locked/corrupt */
              }
            }
          }
          out({ databases }, () => {
            if (!databases.length) {
              console.log(c.dim("no databases in data/"));
              return;
            }
            for (const d of databases) {
              console.log(c.bold(d.db) + c.dim(`  ${d.bytes.toLocaleString()} B`));
              for (const t of d.tables) {
                console.log(`  ${t.name.padEnd(24)} ${String(t.rows).padStart(8)} rows  ${t.columns.join(", ")}`);
              }
            }
          });
        })
    )
  );

  withJson(
    companyOption(
      db
        .command("table")
        .description("page through a table")
        .argument("<db>", "database filename (e.g. main.db)")
        .argument("<table>", "table name")
        .option("--page <n>", "0-based page", "0")
        .option("--page-size <n>", "rows per page", "50")
        .option("--sort <col>", "sort column")
        .option("--dir <asc|desc>", "sort direction", "asc")
        .option("-q, --query <text>", "global text search across columns")
        .action((dbName: string, table: string, opts) => {
          const co = openCompany(ctx, opts.company);
          let handle: InstanceType<typeof DatabaseSync> | null = null;
          try {
            handle = openDb(co, dbName);
            const tableNames = (
              handle.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
            ).map((t) => t.name);
            if (!tableNames.includes(table)) fail(`no such table ${table}`);
            const cols = (handle.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map(
              (c) => c.name
            );
            const colSet = new Set(cols);
            const pageSize = Math.min(500, Math.max(1, Number(opts.pageSize) || 50));
            const page = Math.max(0, Number(opts.page) || 0);
            const sort = String(opts.sort ?? "");
            const dir = opts.dir === "desc" ? "DESC" : "ASC";
            const q = String(opts.query ?? "").trim();
            const where: string[] = [];
            const params: unknown[] = [];
            if (q) {
              where.push("(" + cols.map((c) => `CAST("${c}" AS TEXT) LIKE ?`).join(" OR ") + ")");
              cols.forEach(() => params.push(`%${q}%`));
            }
            const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
            const orderSql = sort && colSet.has(sort) ? ` ORDER BY "${sort}" ${dir}` : "";
            const total = (
              handle.prepare(`SELECT COUNT(*) AS n FROM "${table}"${whereSql}`).get(...(params as never[])) as {
                n: number;
              }
            ).n;
            const rows = handle
              .prepare(`SELECT * FROM "${table}"${whereSql}${orderSql} LIMIT ? OFFSET ?`)
              .all(...([...params, pageSize, page * pageSize] as never[])) as Record<string, unknown>[];
            const payload = {
              db: dbName,
              table,
              columns: cols,
              rows: rows.map((r) => cols.map((c) => r[c])),
              total,
              page,
              pageSize,
              pages: Math.max(1, Math.ceil(total / pageSize)),
            };
            out(payload, () => {
              console.log(c.bold(`${dbName} / ${table}`) + c.dim(`  ${total} rows`));
              console.log(cols.join("\t"));
              for (const row of payload.rows.slice(0, 30)) {
                console.log(row.map((v) => (v === null ? "NULL" : String(v))).join("\t"));
              }
              if (payload.rows.length > 30) console.log(c.dim(`… ${payload.rows.length - 30} more on this page`));
            });
          } catch (e) {
            fail((e as Error).message);
          } finally {
            handle?.close();
          }
        })
    )
  );

  withJson(
    companyOption(
      db
        .command("query")
        .description("run a read-only SQL statement (SELECT / PRAGMA / WITH)")
        .argument("<db>", "database filename")
        .argument("<sql...>", "SQL")
        .action((dbName: string, sqlParts: string[], opts) => {
          const co = openCompany(ctx, opts.company);
          const sql = sqlParts.join(" ").trim();
          if (!/^\s*(select|pragma|with|explain)/i.test(sql)) {
            fail("read-only: only SELECT / PRAGMA / WITH / EXPLAIN");
          }
          let handle: InstanceType<typeof DatabaseSync> | null = null;
          try {
            handle = openDb(co, dbName);
            const rows = handle.prepare(sql).all() as Record<string, unknown>[];
            const limited = rows.slice(0, 200);
            const columns = limited.length ? Object.keys(limited[0]) : [];
            const payload = {
              columns,
              rows: limited.map((r) => columns.map((c) => r[c])),
              total: rows.length,
              truncated: rows.length > 200,
            };
            out(payload, () => {
              if (!columns.length) {
                console.log(c.dim("(no rows)"));
                return;
              }
              console.log(columns.join("\t"));
              for (const row of payload.rows) {
                console.log(row.map((v) => (v === null ? "NULL" : String(v))).join("\t"));
              }
              console.log(c.dim(`${payload.total} row(s)${payload.truncated ? " — first 200" : ""}`));
            });
          } catch (e) {
            fail((e as Error).message);
          } finally {
            handle?.close();
          }
        })
    )
  );

  withJson(
    companyOption(
      db
        .command("export")
        .description("export a table to CSV (up to 100k rows)")
        .argument("<db>", "database filename")
        .argument("<table>", "table name")
        .option("-o, --out <path>", "output csv path (default: stdout)")
        .option("--sort <col>")
        .option("--dir <asc|desc>", "asc")
        .option("-q, --query <text>", "global text filter")
        .action((dbName: string, table: string, opts) => {
          const co = openCompany(ctx, opts.company);
          if (!/^[A-Za-z_][\w]*$/.test(table)) fail("invalid table name");
          let handle: InstanceType<typeof DatabaseSync> | null = null;
          try {
            handle = openDb(co, dbName);
            const tableNames = (
              handle.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
            ).map((t) => t.name);
            if (!tableNames.includes(table)) fail(`no such table ${table}`);
            const cols = (handle.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map(
              (c) => c.name
            );
            const colSet = new Set(cols);
            const sort = String(opts.sort ?? "");
            const dir = opts.dir === "desc" ? "DESC" : "ASC";
            const q = String(opts.query ?? "").trim();
            const where: string[] = [];
            const params: unknown[] = [];
            if (q) {
              where.push("(" + cols.map((c) => `CAST("${c}" AS TEXT) LIKE ?`).join(" OR ") + ")");
              cols.forEach(() => params.push(`%${q}%`));
            }
            const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
            const orderSql = sort && colSet.has(sort) ? ` ORDER BY "${sort}" ${dir}` : "";
            const rows = handle
              .prepare(`SELECT * FROM "${table}"${whereSql}${orderSql} LIMIT ?`)
              .all(...([...params, 100_000] as never[])) as Record<string, unknown>[];
            const esc = (v: unknown): string => {
              if (v === null || v === undefined) return "";
              const s = String(v);
              if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
              return s;
            };
            const lines = [cols.map(esc).join(",")];
            for (const r of rows) lines.push(cols.map((c) => esc(r[c])).join(","));
            const csv = lines.join("\n") + "\n";
            if (opts.out) {
              const dest = path.resolve(String(opts.out));
              fs.writeFileSync(dest, csv);
              out({ ok: true, path: dest, rows: rows.length }, () => {
                console.log(c.green(`wrote ${rows.length} rows → ${dest}`));
              });
            } else if (wantJson()) {
              out({ columns: cols, rows: rows.map((r) => cols.map((c) => r[c])), total: rows.length });
            } else {
              process.stdout.write(csv);
            }
          } catch (e) {
            fail((e as Error).message);
          } finally {
            handle?.close();
          }
        })
    )
  );
}
