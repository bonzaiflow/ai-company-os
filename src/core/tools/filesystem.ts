import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "../../util.js";
import type { Tool } from "./types.js";
import { OUTPUT_CAP, safePath, str } from "./types.js";

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
