import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import { c } from "../util.js";
import {
  companyOption,
  fail,
  openCompany,
  out,
  withJson,
  type CliCtx,
} from "./helpers.js";

export function registerUploadCommands(program: Command, ctx: CliCtx): void {
  withJson(
    companyOption(
      program
        .command("upload")
        .description("copy a local file into company data/uploads/")
        .argument("<file>", "path to file")
        .option("--as <name>", "destination filename inside data/uploads/")
        .action(async (fileArg: string, opts) => {
          const co = openCompany(ctx, opts.company);
          const src = path.resolve(fileArg);
          if (!fs.existsSync(src) || !fs.statSync(src).isFile()) fail(`not a file: ${src}`);
          const name = String(opts.as || path.basename(src))
            .replace(/[^\w.\- ]+/g, "_")
            .slice(0, 120);
          const dir = path.join(co.dir, "data", "uploads");
          fs.mkdirSync(dir, { recursive: true });
          const buf = fs.readFileSync(src);
          if (buf.length > 15_000_000) fail("file too large (15MB max)");
          fs.writeFileSync(path.join(dir, name), buf);
          co.audit({
            type: "upload.received",
            ok: true,
            detail: `data/uploads/${name} (${buf.length} B) (cli)`,
          });
          let preview: { rows: number; withEmail: number; sample: string[] } | null = null;
          let parseError: string | null = null;
          try {
            const { parseBusinessFile } = await import("../core/tools.js");
            const parsed = parseBusinessFile(buf.toString("utf8"), name);
            preview = {
              rows: parsed.length,
              withEmail: parsed.filter((b) => b.email).length,
              sample: parsed.slice(0, 3).map((b) => b.name),
            };
          } catch (e) {
            parseError = e instanceof Error ? e.message : String(e);
          }
          out(
            { ok: true, path: `data/uploads/${name}`, preview, parseError, bytes: buf.length },
            () => {
              console.log(c.green(`uploaded → data/uploads/${name} (${buf.length} B)`));
              if (preview) {
                console.log(
                  c.dim(`parse preview: ${preview.rows} rows, ${preview.withEmail} with email`)
                );
              } else if (parseError) {
                console.log(c.dim(`parse: ${parseError}`));
              }
            }
          );
        })
    )
  );
}
