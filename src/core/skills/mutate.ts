import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureDir, slugify } from "../../util.js";
import {
  copySkillDir,
  resolveSkillDir,
  workspaceSkillsDir,
} from "./fs.js";
import { isEditablePath, safeRelPath } from "./types.js";

/** Write/overwrite SKILL.md (and create the skill folder). Does not wipe other files. */
export function saveSkill(root: string, name: string, content: string): string {
  const clean = slugify(name);
  if (!clean) throw new Error("invalid skill name");
  const dir = path.join(workspaceSkillsDir(root), clean);
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, "SKILL.md"), content);
  return clean;
}

/** Ensure a workspace copy exists (for editing bundled skills / non-md files). */
export function ensureWorkspaceSkill(
  root: string,
  bundledDir: string,
  name: string
): string {
  const clean = slugify(name);
  if (!clean) throw new Error("invalid skill name");
  const ws = path.join(workspaceSkillsDir(root), clean);
  if (fs.existsSync(path.join(ws, "SKILL.md"))) return clean;
  const bundled = path.join(bundledDir, clean);
  if (fs.existsSync(path.join(bundled, "SKILL.md"))) {
    copySkillDir(bundled, ws);
    return clean;
  }
  ensureDir(ws);
  if (!fs.existsSync(path.join(ws, "SKILL.md"))) {
    fs.writeFileSync(path.join(ws, "SKILL.md"), `# ${clean}\n\n`);
  }
  return clean;
}

export function readSkillFile(
  root: string,
  bundledDir: string,
  name: string,
  relPath: string
): { path: string; content: string; source: "bundled" | "workspace"; editable: boolean } {
  const resolved = resolveSkillDir(root, bundledDir, name);
  if (!resolved) throw new Error("skill not found");
  const rel = safeRelPath(relPath || "SKILL.md");
  const abs = path.join(resolved.dir, rel);
  if (!abs.startsWith(resolved.dir + path.sep) && abs !== resolved.dir) {
    throw new Error("invalid skill file path");
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    throw new Error("file not found");
  }
  if (!isEditablePath(rel)) {
    throw new Error("binary or unsupported file type");
  }
  return {
    path: rel,
    content: fs.readFileSync(abs, "utf8"),
    source: resolved.source,
    editable: true,
  };
}

export function writeSkillFile(
  root: string,
  bundledDir: string,
  name: string,
  relPath: string,
  content: string
): { name: string; path: string } {
  const clean = ensureWorkspaceSkill(root, bundledDir, name);
  const rel = safeRelPath(relPath || "SKILL.md");
  if (!isEditablePath(rel)) throw new Error("cannot edit this file type");
  const dir = path.join(workspaceSkillsDir(root), clean);
  const abs = path.join(dir, rel);
  if (!abs.startsWith(dir + path.sep) && abs !== dir) {
    throw new Error("invalid skill file path");
  }
  ensureDir(path.dirname(abs));
  fs.writeFileSync(abs, content);
  return { name: clean, path: rel };
}

export function deleteSkillFile(
  root: string,
  name: string,
  relPath: string
): void {
  const clean = slugify(name);
  const rel = safeRelPath(relPath);
  if (rel === "SKILL.md") throw new Error("cannot delete SKILL.md — delete the skill instead");
  const dir = path.join(workspaceSkillsDir(root), clean);
  if (!fs.existsSync(path.join(dir, "SKILL.md"))) {
    throw new Error("only workspace skills can be modified");
  }
  const abs = path.join(dir, rel);
  if (!abs.startsWith(dir + path.sep)) throw new Error("invalid skill file path");
  if (!fs.existsSync(abs)) throw new Error("file not found");
  const st = fs.statSync(abs);
  if (st.isDirectory()) fs.rmSync(abs, { recursive: true });
  else fs.unlinkSync(abs);
}

export function deleteSkill(root: string, name: string): void {
  const dir = path.join(workspaceSkillsDir(root), slugify(name));
  if (!fs.existsSync(path.join(dir, "SKILL.md"))) {
    throw new Error("only workspace skills can be deleted");
  }
  fs.rmSync(dir, { recursive: true });
}

/** Import skills from an uploaded .zip (any directory containing a SKILL.md
 * becomes a skill; a SKILL.md at the zip root is named after the zip file).
 * Plain .md uploads become a skill named after the file.
 * Zip imports preserve the full skill folder (scripts, subfolders, etc.). */
export function importSkillArchive(
  root: string,
  filename: string,
  data: Buffer
): string[] {
  const base = slugify(path.basename(filename).replace(/\.(zip|md)$/i, ""));

  if (/\.md$/i.test(filename)) {
    return [saveSkill(root, base, data.toString("utf8"))];
  }
  if (!/\.zip$/i.test(filename)) throw new Error("upload a .zip or .md file");

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-company-os-skill-"));
  const zipPath = path.join(tmp, "upload.zip");
  fs.writeFileSync(zipPath, data);
  const dest = path.join(tmp, "x");
  ensureDir(dest);
  try {
    execFileSync("unzip", ["-o", "-q", zipPath, "-d", dest]);
  } catch (e) {
    throw new Error(`could not extract zip (is \`unzip\` installed?): ${(e as Error).message}`);
  }

  const imported: string[] = [];
  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    if (entries.some((e) => e.isFile() && e.name === "SKILL.md")) {
      const name = dir === dest ? base : path.basename(dir);
      const clean = slugify(name);
      const target = path.join(workspaceSkillsDir(root), clean);
      if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
      copySkillDir(dir, target);
      imported.push(clean);
      return; // don't descend into a skill dir
    }
    for (const e of entries) {
      if (e.isDirectory() && e.name !== "__MACOSX") walk(path.join(dir, e.name));
    }
  };
  walk(dest);
  fs.rmSync(tmp, { recursive: true, force: true });

  if (!imported.length) throw new Error("no SKILL.md found in the archive");
  return imported;
}
