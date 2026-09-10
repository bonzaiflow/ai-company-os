import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Compiled CLI lives at dist/cli.js (this module is dist/mcp/run.js). */
export const CLI_JS = path.resolve(HERE, "..", "cli.js");

export function resolveWorkspaceRoot(explicit?: string): string {
  const fromEnv = process.env.AI_COMPANY_OS_ROOT || process.env.AI_COMPANY_OS_WORKSPACE;
  const root = path.resolve(explicit || fromEnv || process.cwd());
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`workspace is not a directory: ${root}`);
  }
  return root;
}

export interface RunCliOptions {
  argv: string[];
  cwd?: string;
  /** Extra env (merged over process.env). */
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface RunCliResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  argv: string[];
  cwd: string;
}

/**
 * Invoke `ai-company-os --json …` in the workspace. Always injects `--json`
 * unless the caller already passed it.
 */
export function runCli(opts: RunCliOptions): Promise<RunCliResult> {
  const cwd = resolveWorkspaceRoot(opts.cwd);
  const raw = opts.argv.map(String);
  const argv = raw[0] === "--json" || raw.includes("--json") ? raw : ["--json", ...raw];
  const timeoutMs = opts.timeoutMs ?? 10 * 60_000;

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI_JS, ...argv], {
      cwd,
      env: { ...process.env, ...opts.env, AI_COMPANY_OS_YES: process.env.AI_COMPANY_OS_YES || "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      stderr += `\n[mcp] killed after ${timeoutMs}ms`;
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        code: null,
        stdout,
        stderr: stderr + String(err.message),
        argv,
        cwd,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        code,
        stdout,
        stderr,
        argv,
        cwd,
      });
    });
  });
}

/** Format CLI result for MCP tool content (prefer stdout JSON). */
export function formatCliResult(result: RunCliResult): { text: string; isError: boolean } {
  const body = result.stdout.trim() || result.stderr.trim() || `(exit ${result.code})`;
  if (result.ok) return { text: body, isError: false };
  const errBits = [body];
  if (result.stderr.trim() && result.stdout.trim()) errBits.push("stderr:\n" + result.stderr.trim());
  return { text: errBits.join("\n\n"), isError: true };
}
