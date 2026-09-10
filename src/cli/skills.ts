import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import {
  deleteSkill,
  deleteSkillFile,
  importSkillArchive,
  listSkills,
  readSkillFile,
  writeSkillFile,
} from "../core/skills.js";
import { c } from "../util.js";
import { fail, out, withJson, type CliCtx } from "./helpers.js";

export function registerSkillsCommands(program: Command, ctx: CliCtx): void {
  const skills = program.command("skills").description("list / read / edit / import workspace skills");

  withJson(
    skills
      .command("list")
      .description("list bundled + workspace skills")
      .action(() => {
        const list = listSkills(ctx.root, ctx.bundledSkills).map((s) => ({
          name: s.name,
          source: s.source,
          files: s.files,
          hasScripts: s.hasScripts,
          tree: s.tree,
        }));
        out({ skills: list }, () => {
          for (const s of list) {
            console.log(
              `${c.bold(s.name.padEnd(24))} ${s.source.padEnd(10)} files=${s.files} scripts=${s.hasScripts ? "y" : "n"}`
            );
          }
        });
      })
  );

  withJson(
    skills
      .command("show")
      .description("print a skill file (default SKILL.md)")
      .argument("<name>", "skill name")
      .option("--path <file>", "relative path inside the skill", "SKILL.md")
      .action((name: string, opts) => {
        try {
          const file = readSkillFile(ctx.root, ctx.bundledSkills, name, String(opts.path || "SKILL.md"));
          out({ name, ...file }, () => {
            console.log(c.dim(`${name} / ${file.path} (${file.source})`));
            console.log(file.content);
          });
        } catch (e) {
          fail((e as Error).message);
        }
      })
  );

  withJson(
    skills
      .command("save")
      .description("write a skill file (copies bundled → workspace if needed)")
      .argument("<name>", "skill name")
      .option("--path <file>", "relative path inside the skill", "SKILL.md")
      .option("--file <path>", "read content from a local file")
      .option("--content <text>", "inline content (prefer --file for long text)")
      .action((name: string, opts) => {
        let content = "";
        if (opts.file) {
          const p = path.resolve(String(opts.file));
          if (!fs.existsSync(p)) fail(`file not found: ${p}`);
          content = fs.readFileSync(p, "utf8");
        } else if (opts.content !== undefined) {
          content = String(opts.content);
        } else {
          fail("provide --file or --content");
        }
        try {
          const saved = writeSkillFile(
            ctx.root,
            ctx.bundledSkills,
            name,
            String(opts.path || "SKILL.md"),
            content
          );
          out({ ok: true, ...saved }, () => console.log(c.green(`saved ${saved.name}/${saved.path}`)));
        } catch (e) {
          fail((e as Error).message);
        }
      })
  );

  withJson(
    skills
      .command("delete")
      .description("delete a workspace skill (or one file inside it)")
      .argument("<name>", "skill name")
      .option("--path <file>", "delete only this relative file (not the whole skill)")
      .option("-y, --yes", "skip confirmation")
      .action((name: string, opts) => {
        if (!opts.yes && !process.env.AI_COMPANY_OS_YES) {
          fail("refusing to delete without --yes (or AI_COMPANY_OS_YES=1)");
        }
        try {
          if (opts.path) {
            deleteSkillFile(ctx.root, name, String(opts.path));
            out({ ok: true, name, path: opts.path }, () =>
              console.log(c.green(`deleted ${name}/${opts.path}`))
            );
          } else {
            deleteSkill(ctx.root, name);
            out({ ok: true, name }, () => console.log(c.green(`deleted skill ${name}`)));
          }
        } catch (e) {
          fail((e as Error).message);
        }
      })
  );

  withJson(
    skills
      .command("upload")
      .description("import a skill from a .zip archive")
      .argument("<zip>", "path to skill zip")
      .action((zipArg: string) => {
        const zipPath = path.resolve(zipArg);
        if (!fs.existsSync(zipPath)) fail(`file not found: ${zipPath}`);
        try {
          const imported = importSkillArchive(
            ctx.root,
            path.basename(zipPath),
            fs.readFileSync(zipPath)
          );
          out({ ok: true, imported }, () =>
            console.log(c.green(`imported: ${imported.join(", ") || "(none)"}`))
          );
        } catch (e) {
          fail((e as Error).message);
        }
      })
  );
}
