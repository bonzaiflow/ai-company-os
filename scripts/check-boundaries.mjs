#!/usr/bin/env node
/**
 * Lightweight layer boundaries for ai-company-os.
 * Fails CI-style if a lower layer imports an upper one.
 *
 * Allowed cone (simplified):
 *   cli / ui  →  core / llm / root
 *   core      →  llm / root / core/*
 *   llm       →  root only (types, util) — NOT core/
 *   root      →  almost nothing upward
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.ts$/.test(ent.name)) out.push(p);
  }
  return out;
}

function layerOf(rel) {
  if (rel.startsWith("llm/")) return "llm";
  if (rel.startsWith("core/")) return "core";
  if (rel.startsWith("ui/")) return "ui";
  if (rel.startsWith("cli/") || rel === "cli.ts") return "cli";
  if (rel.startsWith("mcp/") || rel === "mcp.ts") return "mcp";
  return "root"; // types, util, config, planner, …
}

/** relative import target resolved to src-relative path, or null */
function resolveRel(fromAbs, spec) {
  if (!spec.startsWith(".")) return null;
  const cleaned = spec.replace(/\.(js|ts|tsx)$/, "");
  const base = path.resolve(path.dirname(fromAbs), cleaned);
  for (const c of [base + ".ts", path.join(base, "index.ts")]) {
    if (fs.existsSync(c)) return path.relative(SRC, c).replace(/\\/g, "/");
  }
  return null;
}

const forbidden = [
  // llm must not depend on core (store, runtime, …)
  { from: "llm", to: "core", why: "llm must stay free of core/store; pass CompanyMeta instead" },
  // foundations must not reach up
  { from: "root", to: "ui", why: "root helpers must not import UI" },
  { from: "root", to: "cli", why: "root helpers must not import CLI (except intentional entry shim)" },
  // tools / core must not import UI or CLI
  { from: "core", to: "ui", why: "core must not import UI" },
  { from: "core", to: "cli", why: "core must not import CLI" },
  { from: "llm", to: "ui", why: "llm must not import UI" },
  { from: "llm", to: "cli", why: "llm must not import CLI" },
];

const importRe = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
const violations = [];

for (const file of walk(SRC)) {
  const rel = path.relative(SRC, file).replace(/\\/g, "/");
  // Allow the thin composition-root shim to import cli/main
  if (rel === "cli.ts") continue;

  const fromLayer = layerOf(rel);
  const code = fs.readFileSync(file, "utf8");
  let m;
  const re = new RegExp(importRe.source, "gm");
  while ((m = re.exec(code)) !== null) {
    const target = resolveRel(file, m[1]);
    if (!target) continue;
    const toLayer = layerOf(target);
    for (const rule of forbidden) {
      if (fromLayer === rule.from && toLayer === rule.to) {
        violations.push({ file: rel, import: target, rule: rule.why });
      }
    }
  }
}

if (violations.length) {
  console.error("Import boundary violations:\n");
  for (const v of violations) {
    console.error(`  ${v.file} → ${v.import}\n    ${v.rule}`);
  }
  process.exit(1);
}

console.log("Import boundaries OK (" + walk(SRC).length + " files checked)");
