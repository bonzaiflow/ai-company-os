import type { Command } from "commander";
import type { Company } from "../core/store.js";
import { Company as CompanyClass } from "../core/store.js";
import { c } from "../util.js";

export interface CliCtx {
  root: string;
  bundledSkills: string;
  /** True when the user passed --json (global or on the command). */
  json: boolean;
}

let activeJson = false;

export function setJsonMode(on: boolean): void {
  activeJson = !!on;
}

export function wantJson(opts?: { json?: boolean }): boolean {
  return activeJson || !!opts?.json;
}

export function out(data: unknown, human?: () => void): void {
  if (activeJson) {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
    return;
  }
  if (human) human();
  else process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

export function fail(msg: string, code = 1): never {
  if (activeJson) {
    process.stdout.write(JSON.stringify({ ok: false, error: msg }) + "\n");
  } else {
    console.error(c.red(msg));
  }
  process.exit(code);
}

export function openCompany(ctx: CliCtx, slug?: string): Company {
  const all = CompanyClass.list(ctx.root);
  if (slug) {
    try {
      return CompanyClass.open(ctx.root, slug);
    } catch (e) {
      return fail((e as Error).message);
    }
  }
  if (all.length === 1) return CompanyClass.open(ctx.root, all[0]);
  if (!all.length) return fail("no companies yet — run `ai-company-os plan` first");
  return fail(`multiple companies, pick one with -c/--company: ${all.join(", ")}`);
}

export function companyOption(cmd: Command): Command {
  return cmd.option("-c, --company <slug>", "company slug (required if several exist)");
}

export function jsonOption(cmd: Command): Command {
  return cmd.option("--json", "machine-readable JSON output (for MCP / scripts)");
}

/** Attach a pre-action that flips JSON mode from command opts or parent. */
export function withJson(cmd: Command): Command {
  jsonOption(cmd);
  cmd.hook("preAction", (_thisCommand, actionCommand) => {
    const opts = actionCommand.opts() as { json?: boolean };
    if (opts.json) setJsonMode(true);
  });
  return cmd;
}
