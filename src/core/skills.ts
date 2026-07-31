import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureDir, slugify } from "../util.js";

export interface SkillFileEntry {
  path: string;
  kind: "file" | "dir";
  bytes?: number;
  editable: boolean;
}

export interface SkillInfo {
  name: string;
  source: "bundled" | "workspace";
  content: string;
  files: number;
  hasScripts: boolean;
  tree: SkillFileEntry[];
}

const TEXT_EXTS = new Set([
  ".md", ".txt", ".py", ".js", ".ts", ".json", ".yaml", ".yml", ".toml",
  ".csv", ".sql", ".sh", ".bash", ".zsh", ".html", ".css", ".xml", ".svg",
  ".env", ".ini", ".cfg", ".conf", ".r", ".rb", ".go", ".rs", ".java",
]);

const SKIP_NAMES = new Set([".DS_Store", "__MACOSX", "Thumbs.db"]);

export function workspaceSkillsDir(root: string): string {
  return path.join(root, "skills");
}

function skillsIn(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((d) => fs.existsSync(path.join(dir, d, "SKILL.md")))
    .sort();
}

function isEditablePath(rel: string): boolean {
  const base = path.basename(rel);
  if (base.startsWith(".") && base !== ".env") return false;
  const ext = path.extname(base).toLowerCase();
  if (!ext) return true; // extensionless text (Makefile, Dockerfile, etc.)
  return TEXT_EXTS.has(ext);
}

function safeRelPath(rel: string): string {
  const norm = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!norm || norm.includes("..") || path.isAbsolute(norm)) {
    throw new Error("invalid skill file path");
  }
  return norm;
}

/** Resolve a skill folder; workspace overrides bundled. */
export function resolveSkillDir(
  root: string,
  bundledDir: string,
  name: string
): { dir: string; source: "bundled" | "workspace" } | null {
  const clean = slugify(name);
  if (!clean) return null;
  const ws = path.join(workspaceSkillsDir(root), clean);
  if (fs.existsSync(path.join(ws, "SKILL.md"))) {
    return { dir: ws, source: "workspace" };
  }
  const bundled = path.join(bundledDir, clean);
  if (fs.existsSync(path.join(bundled, "SKILL.md"))) {
    return { dir: bundled, source: "bundled" };
  }
  return null;
}

export function listSkillTree(skillDir: string): SkillFileEntry[] {
  const out: SkillFileEntry[] = [];
  const walk = (abs: string, rel: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => {
      if (a.name === "SKILL.md") return -1;
      if (b.name === "SKILL.md") return 1;
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const e of entries) {
      if (SKIP_NAMES.has(e.name) || e.name.startsWith(".")) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      const childAbs = path.join(abs, e.name);
      if (e.isDirectory()) {
        out.push({ path: childRel, kind: "dir", editable: false });
        walk(childAbs, childRel);
      } else if (e.isFile()) {
        const st = fs.statSync(childAbs);
        out.push({
          path: childRel,
          kind: "file",
          bytes: st.size,
          editable: isEditablePath(childRel),
        });
      }
    }
  };
  walk(skillDir, "");
  return out;
}

function skillStats(tree: SkillFileEntry[]): { files: number; hasScripts: boolean } {
  const files = tree.filter((t) => t.kind === "file").length;
  const hasScripts = tree.some(
    (t) =>
      t.kind === "file" &&
      (/\.(py|sh|js|ts|rb|r)$/i.test(t.path) ||
        /(^|\/)scripts\//i.test(t.path))
  );
  return { files, hasScripts };
}

/** Workspace skills override bundled ones of the same name. */
export function listSkills(root: string, bundledDir: string): SkillInfo[] {
  const out = new Map<string, SkillInfo>();
  const add = (name: string, source: "bundled" | "workspace", dir: string) => {
    const tree = listSkillTree(dir);
    const { files, hasScripts } = skillStats(tree);
    out.set(name, {
      name,
      source,
      content: fs.readFileSync(path.join(dir, "SKILL.md"), "utf8"),
      files,
      hasScripts,
      tree,
    });
  };
  for (const name of skillsIn(bundledDir)) {
    add(name, "bundled", path.join(bundledDir, name));
  }
  for (const name of skillsIn(workspaceSkillsDir(root))) {
    add(name, "workspace", path.join(workspaceSkillsDir(root), name));
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function skillNames(root: string, bundledDir: string): string[] {
  return listSkills(root, bundledDir).map((s) => s.name);
}

/** Directories to search when a company is scaffolded (first hit wins). */
export function skillSearchDirs(root: string, bundledDir: string): string[] {
  return [workspaceSkillsDir(root), bundledDir];
}

export function copySkillDir(src: string, dest: string): void {
  ensureDir(dest);
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (p) => {
      const base = path.basename(p);
      return !SKIP_NAMES.has(base) && base !== "__MACOSX";
    },
  });
}

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
