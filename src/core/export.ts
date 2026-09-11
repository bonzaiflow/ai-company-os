import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CompanyMeta } from "../types.js";
import { ensureDir, nowIso, writeJson } from "../util.js";
import type { Company } from "./store.js";

export type CompanyExportMode = "layout" | "full";

export interface CompanyExportResult {
  /** Absolute path to the zip file (caller should delete after streaming). */
  zipPath: string;
  filename: string;
  cleanup: () => void;
}

/** Meta suitable for sharing a layout — drop runtime wake timestamps / pause. */
function layoutMeta(meta: CompanyMeta): CompanyMeta {
  const out: CompanyMeta = { ...meta };
  delete out.paused;
  if (out.schedule) {
    out.schedule = {
      everyMinutes: out.schedule.everyMinutes,
      maxTicks: out.schedule.maxTicks,
      active: false,
    };
  }
  if (out.checkins) {
    out.checkins = { everyHours: out.checkins.everyHours };
  }
  // Keep connectors config (env *names* only); strip poll cursors (separate file).
  return out;
}

function writeLayoutTree(co: Company, dest: string): void {
  ensureDir(dest);
  writeJson(path.join(dest, "company.json"), layoutMeta(co.meta));

  for (const name of ["plan.md"]) {
    const src = path.join(co.dir, name);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dest, name));
  }

  // Org chart: agent profiles only (empty mailboxes / workspace).
  const agentsSrc = path.join(co.dir, "agents");
  if (fs.existsSync(agentsSrc)) {
    for (const name of fs.readdirSync(agentsSrc)) {
      const profile = path.join(agentsSrc, name, "profile.md");
      if (!fs.existsSync(profile)) continue;
      const agentDest = path.join(dest, "agents", name);
      for (const sub of ["INBOX", "OUTBOX", "workspace"]) ensureDir(path.join(agentDest, sub));
      fs.copyFileSync(profile, path.join(agentDest, "profile.md"));
    }
  }

  // Skills copied at launch — part of how the company is designed to work.
  const skillsSrc = path.join(co.dir, "skills");
  if (fs.existsSync(skillsSrc)) {
    fs.cpSync(skillsSrc, path.join(dest, "skills"), { recursive: true });
  }

  // Empty placeholders so a recipient recognizes the folder shape.
  ensureDir(path.join(dest, "tasks"));
  ensureDir(path.join(dest, "data"));
  writeJson(path.join(dest, "chat.json"), []);
  writeJson(path.join(dest, "queue.json"), []);

  fs.writeFileSync(
    path.join(dest, "EXPORT.md"),
    [
      `# ${co.meta.name} — layout export`,
      "",
      `Exported ${nowIso()} as **layout** (plan + organization + skills + settings).`,
      "",
      "Not included: tasks, queue history, chat transcripts, audit log, spend,",
      "approvals, check-ins, connector poll state, or `data/` contents.",
      "",
      "Drop this folder under `companies/<slug>/` (or unzip there) to share the",
      "company shape. Re-enqueue work via the UI/CLI after import.",
      "",
    ].join("\n")
  );
}

function zipDirectory(sourceDir: string, zipPath: string, rootName: string): void {
  // zip stores paths relative to cwd; use rootName as the top folder inside the archive.
  const parent = path.dirname(sourceDir);
  const base = path.basename(sourceDir);
  try {
    execFileSync("zip", ["-r", "-q", zipPath, base], { cwd: parent });
  } catch (e) {
    throw new Error(`could not create zip (is \`zip\` installed?): ${(e as Error).message}`);
  }
  // If the folder wasn't named rootName, rename inside… we stage as rootName already.
  void rootName;
}

/**
 * Build a shareable zip of a company.
 * - layout: plan, org (profiles), skills, settings — no tasks/data/runtime
 * - full: entire company directory as-is
 */
export function exportCompanyZip(co: Company, mode: CompanyExportMode): CompanyExportResult {
  if (mode !== "layout" && mode !== "full") {
    throw new Error('mode must be "layout" or "full"');
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-company-os-export-"));
  const cleanup = () => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };

  try {
    const rootName = co.meta.slug || path.basename(co.dir);
    const suffix = mode === "layout" ? "layout" : "full";
    const filename = `${rootName}-${suffix}.zip`;
    const zipPath = path.join(tmp, filename);

    if (mode === "full") {
      // Copy whole tree so we don't zip a live dir mid-write oddly; still a snapshot.
      const staged = path.join(tmp, rootName);
      fs.cpSync(co.dir, staged, { recursive: true });
      fs.writeFileSync(
        path.join(staged, "EXPORT.md"),
        [
          `# ${co.meta.name} — full export`,
          "",
          `Exported ${nowIso()} as **full** (layout + tasks + data + runtime files).`,
          "",
          "Place under `companies/` (folder name = slug) to restore.",
          "",
        ].join("\n")
      );
      zipDirectory(staged, zipPath, rootName);
    } else {
      const staged = path.join(tmp, rootName);
      writeLayoutTree(co, staged);
      zipDirectory(staged, zipPath, rootName);
    }

    if (!fs.existsSync(zipPath)) throw new Error("zip produced no file");
    return { zipPath, filename, cleanup };
  } catch (e) {
    cleanup();
    throw e;
  }
}

export interface DataExportFile {
  /** Path relative to company dir, e.g. data/exports/lead-pack.csv */
  path: string;
  name: string;
  bytes: number;
  mtime: string;
}

/** Agent/owner deliverables under companies/<slug>/data/exports/. */
export function listDataExports(co: Company): DataExportFile[] {
  const dir = path.join(co.dir, "data", "exports");
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  const out: DataExportFile[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const full = path.join(dir, name);
    let st: fs.Stats;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    out.push({
      path: `data/exports/${name}`,
      name,
      bytes: st.size,
      mtime: st.mtime.toISOString(),
    });
  }
  out.sort((a, b) => b.mtime.localeCompare(a.mtime) || a.name.localeCompare(b.name));
  return out;
}

/** Resolve a safe absolute path under data/exports/; throws if invalid. */
export function resolveDataExportFile(co: Company, relOrName: string): { abs: string; name: string; rel: string } {
  const raw = String(relOrName ?? "").trim().replace(/\\/g, "/");
  const name = path.basename(raw.includes("/") ? raw : raw);
  if (!name || name === "." || name === ".." || name.includes("\0")) {
    throw new Error("invalid export file name");
  }
  const abs = path.resolve(co.dir, "data", "exports", name);
  const root = path.resolve(co.dir, "data", "exports");
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error("path escapes data/exports");
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    throw new Error("not found");
  }
  return { abs, name, rel: `data/exports/${name}` };
}
