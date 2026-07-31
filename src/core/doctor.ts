import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveCliCommand } from "../llm/index.js";
import type { AiCompanyOsConfig } from "../types.js";
import { fetchTool, filesystemTool, searchTool, sqliteTool, type ToolContext } from "./tools.js";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  /** warn = degraded but not fatal (e.g. network flake) */
  level: "ok" | "warn" | "fail";
  detail: string;
}

/** Self-test every tool against a real probe and every configured provider's
 * reachability. Run via `ai-company-os doctor`, and at UI-server boot so a broken
 * environment is loud BEFORE agents burn steps on it. */
export async function runDoctor(cfg: AiCompanyOsConfig): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const add = (name: string, ok: boolean, detail: string, warnOnly = false) =>
    checks.push({ name, ok, level: ok ? "ok" : warnOnly ? "warn" : "fail", detail });

  // ---- tools, probed in a throwaway sandbox shaped like a company dir ----
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-company-os-doctor-"));
  const ctx: ToolContext = { company: { dir } as ToolContext["company"], agent: "doctor" };
  try {
    try {
      await filesystemTool.run(ctx, { op: "write", path: "data/probe.txt", content: "ok" });
      const back = await filesystemTool.run(ctx, { op: "read", path: "data/probe.txt" });
      add("tool.filesystem", back.trim() === "ok", "write/read roundtrip");
    } catch (e) {
      add("tool.filesystem", false, (e as Error).message);
    }
    try {
      const out = await sqliteTool.run(ctx, { db: "probe.db", sql: "SELECT 1 AS one" });
      add("tool.sqlite", out.includes('"one"') || out.includes("1"), "SELECT 1");
    } catch (e) {
      add("tool.sqlite", false, (e as Error).message);
    }
    try {
      const out = await fetchTool.run(ctx, { url: "https://example.com" });
      add("tool.fetch", out.includes("HTTP 200"), "GET https://example.com", true);
    } catch (e) {
      add("tool.fetch", false, (e as Error).message, true);
    }
    try {
      const out = await searchTool.run(ctx, { query: "duckduckgo" });
      add("tool.search", !out.startsWith("no results"), "1 live search", true);
    } catch (e) {
      add("tool.search", false, (e as Error).message, true);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // ---- providers: reachability, not inference (no tokens spent) ----
  for (const [name, pc] of Object.entries(cfg.providers)) {
    if (pc.type === "mock") continue;
    if (pc.type === "ollama") {
      try {
        const r = await fetch(`${pc.baseUrl ?? "http://localhost:11434"}/api/tags`, {
          signal: AbortSignal.timeout(4000),
        });
        const models = ((await r.json()) as { models: { name: string }[] }).models.map((m) => m.name);
        const has = !pc.model || models.some((m) => m === pc.model || m.startsWith(pc.model + ":"));
        add(
          `provider.${name}`,
          r.ok && has,
          has ? `${models.length} models at ${pc.baseUrl}` : `reachable but model "${pc.model}" not pulled`,
          true
        );
      } catch (e) {
        add(`provider.${name}`, false, `unreachable: ${pc.baseUrl} (${(e as Error).message})`, true);
      }
    } else if (pc.type === "openrouter") {
      const envVar = pc.apiKeyEnv ?? "OPENROUTER_API_KEY";
      add(`provider.${name}`, !!process.env[envVar], process.env[envVar] ? "API key present" : `env ${envVar} not set`, true);
    } else if (pc.type === "cursor") {
      const cmd = resolveCliCommand(pc.command ?? "cursor-agent");
      add(`provider.${name}`, fs.existsSync(cmd) || cmd.includes("/") === false, `binary: ${cmd}`, true);
    } else if (pc.type === "claude") {
      const cmd = resolveCliCommand(pc.command ?? "claude");
      add(`provider.${name}`, fs.existsSync(cmd) || !cmd.includes("/"), `binary: ${cmd} (needs \`claude\` /login)`, true);
    }
  }

  return checks;
}

export function formatDoctor(checks: DoctorCheck[]): string {
  return checks
    .map((c) => `${c.level === "ok" ? "✓" : c.level === "warn" ? "⚠" : "✗"} ${c.name.padEnd(24)} ${c.detail}`)
    .join("\n");
}
