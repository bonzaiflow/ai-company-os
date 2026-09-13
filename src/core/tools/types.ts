import path from "node:path";
import type { Company } from "../store.js";

export const OUTPUT_CAP = 4000;

export interface ToolContext {
  company: Company;
  agent: string;
  /** cooperative stop — long-running tools (discover) check this between
   * units of work so an owner Stop lands within seconds, not minutes */
  shouldStop?: () => boolean;
}

export interface Tool {
  name: string;
  /** one-line description + args, shown to the model */
  doc: string;
  run(ctx: ToolContext, args: Record<string, unknown>): Promise<string>;
}

/** Resolve a user/model supplied path inside the company dir, or throw.
 * Agents may only touch files within their company. */
export function safePath(companyDir: string, p: string): string {
  // Always compare absolute paths — Company.dir is sometimes relative
  // ("companies/foo"); path.resolve then produces an absolute child that
  // does not start with the relative prefix and falsely trips "escapes".
  const root = path.resolve(companyDir);
  const resolved = path.resolve(root, String(p ?? ""));
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`path escapes company directory: ${p}`);
  }
  return resolved;
}

export const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
