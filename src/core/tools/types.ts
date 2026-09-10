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
  const resolved = path.resolve(companyDir, String(p ?? ""));
  if (resolved !== companyDir && !resolved.startsWith(companyDir + path.sep)) {
    throw new Error(`path escapes company directory: ${p}`);
  }
  return resolved;
}

export const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
