import path from "node:path";

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

export const TEXT_EXTS = new Set([
  ".md", ".txt", ".py", ".js", ".ts", ".json", ".yaml", ".yml", ".toml",
  ".csv", ".sql", ".sh", ".bash", ".zsh", ".html", ".css", ".xml", ".svg",
  ".env", ".ini", ".cfg", ".conf", ".r", ".rb", ".go", ".rs", ".java",
]);

export const SKIP_NAMES = new Set([".DS_Store", "__MACOSX", "Thumbs.db"]);

export function isEditablePath(rel: string): boolean {
  const base = path.basename(rel);
  if (base.startsWith(".") && base !== ".env") return false;
  const ext = path.extname(base).toLowerCase();
  if (!ext) return true; // extensionless text (Makefile, Dockerfile, etc.)
  return TEXT_EXTS.has(ext);
}

export function safeRelPath(rel: string): string {
  const norm = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!norm || norm.includes("..") || path.isAbsolute(norm)) {
    throw new Error("invalid skill file path");
  }
  return norm;
}
