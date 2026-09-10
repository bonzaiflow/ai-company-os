import type { Tool } from "./types.js";
export type { Tool, ToolContext } from "./types.js";
export { filesystemTool } from "./filesystem.js";
export { fetchTool, repairUrl } from "./web.js";
export { sqliteTool } from "./sqlite.js";
export { searchTool } from "./search.js";
export { discoverTool, DACH_CITIES } from "./discover.js";
export { importdataTool, parseBusinessFile } from "./importdata.js";
export { emailTool, telegramTool, webhookTool } from "./outbound.js";

import { filesystemTool } from "./filesystem.js";
import { fetchTool } from "./web.js";
import { sqliteTool } from "./sqlite.js";
import { searchTool } from "./search.js";
import { discoverTool } from "./discover.js";
import { importdataTool } from "./importdata.js";
import { emailTool, telegramTool, webhookTool } from "./outbound.js";

const ALL: Tool[] = [
  filesystemTool,
  fetchTool,
  sqliteTool,
  searchTool,
  discoverTool,
  importdataTool,
  emailTool,
  telegramTool,
  webhookTool,
];

/** filesystem and sqlite are sandboxed to the company directory — every agent
 * always has them. Profiles only opt agents into NETWORK tools. This kills
 * the "tool filesystem not available" class of failure for good. */
const BASELINE = ["filesystem", "sqlite", "importdata"];

/** Loose names that plans and models produce; resolve instead of erroring. */
export const TOOL_ALIASES: Record<string, string> = {
  browser: "fetch", web: "fetch", http: "fetch", url: "fetch", curl: "fetch",
  read_file: "filesystem", write_file: "filesystem", file: "filesystem",
  files: "filesystem", fs: "filesystem", read: "filesystem", write: "filesystem",
  db: "sqlite", database: "sqlite", sql: "sqlite", sqlite3: "sqlite",
  google: "search", websearch: "search", web_search: "search", duckduckgo: "search",
  mail: "email", smtp: "email", imap: "email",
  tg: "telegram",
  http_post: "webhook", hook: "webhook",
};

export function resolveToolName(name: string): string {
  const n = (name ?? "").toLowerCase().trim();
  return TOOL_ALIASES[n] ?? n;
}

export function toolsFor(names: string[]): Tool[] {
  const wanted = new Set([...BASELINE, ...names.map(resolveToolName)]);
  // discover is the bulk sibling of search — any agent that can search should
  // be able to discover (this is the scaling tool for large lead lists).
  if (wanted.has("search") || wanted.has("fetch")) wanted.add("discover");
  return ALL.filter((t) => wanted.has(t.name));
}

export function allToolNames(): string[] {
  return ALL.map((t) => t.name);
}

export function baselineToolNames(): string[] {
  return [...BASELINE];
}
