import fs from "node:fs";
import path from "node:path";
import { ensureDir, slugify } from "../../util.js";
import {
  SKIP_NAMES,
  isEditablePath,
  type SkillFileEntry,
  type SkillInfo,
} from "./types.js";

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
