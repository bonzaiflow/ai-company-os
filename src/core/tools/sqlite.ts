import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ensureDir, truncate } from "../../util.js";
import type { Tool } from "./types.js";
import { OUTPUT_CAP, safePath, str } from "./types.js";

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
