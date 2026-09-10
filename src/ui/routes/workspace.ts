import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  initWorkspace,
  isWorkspaceInitialized,
  loadConfig,
  saveRoles,
  setPersistedWorkspaceRoot,
} from "../../config.js";
import { skillNames } from "../../core/skills.js";
import { Company } from "../../core/store.js";
import { resolveCliCommand } from "../../llm/index.js";
import { c, writeJson } from "../../util.js";
import { json, readBody } from "../http.js";
import type { RouteHandler } from "./types.js";

const execFileAsync = promisify(execFile);

let cursorModelsCache: { at: number; models: string[] } | null = null;

/** `cursor-agent --list-models` prints "id - Label" lines; cache 10 min. */
async function cursorModels(command: string): Promise<string[]> {
  if (cursorModelsCache && Date.now() - cursorModelsCache.at < 600_000) {
    return cursorModelsCache.models;
  }
  try {
    const { stdout } = await execFileAsync(resolveCliCommand(command), ["--list-models"], {
      timeout: 30_000,
    });
    const models = stdout
      .split("\n")
      .map((l) => /^([\w.[\]=,-]+) - /.exec(l.trim())?.[1])
      .filter((m): m is string => !!m);
    if (models.length) {
      cursorModelsCache = { at: Date.now(), models };
      return models;
    }
  } catch (e) {
    console.error("cursor --list-models failed:", (e as Error).message.slice(0, 300));
  }
  return ["auto"];
}

/** /api/config, /api/workspace*, /api/models, /api/budget — workspace & config. */
export const handleWorkspaceRoutes: RouteHandler = async ({
  root,
  setRoot,
  bundledSkillsDir,
  req,
  res,
  url,
}) => {
  if (req.method === "GET" && url.pathname === "/api/config") {
    const cfg = loadConfig(root);
    json(res, {
      root,
      providers: Object.keys(cfg.providers).filter((p) => cfg.providers[p].type !== "mock"),
      defaultProvider: cfg.defaultProvider,
      roles: cfg.roles ?? {},
      models: cfg.models ?? {},
      skills: skillNames(root, bundledSkillsDir),
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/workspace") {
    json(res, { root, initialized: isWorkspaceInitialized(root) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/workspace") {
    const body = await readBody(req);
    const raw = String(body.root ?? "").trim();
    if (!raw) {
      json(res, { error: "root is required" }, 400);
      return true;
    }
    const next = path.resolve(raw);
    if (!fs.existsSync(next) || !fs.statSync(next).isDirectory()) {
      json(res, { error: "not a directory: " + next }, 400);
      return true;
    }
    if (body.init) initWorkspace(next);
    setRoot?.(next);
    setPersistedWorkspaceRoot(next);
    console.log(c.dim("workspace → " + next));
    json(res, { root: next, initialized: isWorkspaceInitialized(next) });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/workspace/browse") {
    const raw = url.searchParams.get("path") || root || os.homedir();
    const dir = path.resolve(raw);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      json(res, { error: "not a directory: " + dir }, 400);
      return true;
    }
    const parent = path.dirname(dir);
    let entries: { name: string; path: string }[] = [];
    try {
      entries = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith("."))
        .map((d) => ({ name: d.name, path: path.join(dir, d.name) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
      json(res, { error: (e as Error).message }, 403);
      return true;
    }
    json(res, {
      path: dir,
      parent: parent !== dir ? parent : null,
      home: os.homedir(),
      initialized: isWorkspaceInitialized(dir),
      entries,
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/config") {
    const body = await readBody(req);
    saveRoles(root, body.roles ?? {}, body.models ?? {});
    json(res, { ok: true });
    return true;
  }

  // available models for one provider (source): live from ollama /
  // openrouter, falling back to the configured default model
  if (req.method === "GET" && url.pathname === "/api/models") {
    const cfg = loadConfig(root);
    const name = url.searchParams.get("provider") ?? "";
    const pc = cfg.providers[name];
    if (!pc) {
      json(res, { error: `unknown provider "${name}"` }, 404);
      return true;
    }
    const fallback = pc.model ? [pc.model] : [];
    try {
      if (pc.type === "ollama") {
        const r = await fetch(`${pc.baseUrl ?? "http://localhost:11434"}/api/tags`, {
          signal: AbortSignal.timeout(4000),
        });
        const data = (await r.json()) as { models: { name: string }[] };
        const names = data.models.map((m) => m.name).sort();
        json(res, { models: names.length ? names : fallback, default: pc.model });
        return true;
      }
      if (pc.type === "cursor") {
        json(res, { models: await cursorModels(pc.command ?? "cursor-agent"), default: pc.model ?? "auto" });
        return true;
      }
      if (pc.type === "claude") {
        // Claude Code has no --list-models; offer the aliases + known ids
        json(res, {
          models: ["sonnet", "opus", "haiku", "claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5"],
          default: pc.model ?? "sonnet",
        });
        return true;
      }
      if (pc.type === "openrouter") {
        const r = await fetch(`${pc.baseUrl ?? "https://openrouter.ai/api/v1"}/models`, {
          signal: AbortSignal.timeout(6000),
        });
        const data = (await r.json()) as { data: { id: string }[] };
        const ids = data.data.map((m) => m.id);
        // free models first, then the rest alphabetically, capped
        const free = ids.filter((i) => i.endsWith(":free")).sort();
        const paid = ids.filter((i) => !i.endsWith(":free")).sort();
        json(res, { models: [...free, ...paid].slice(0, 300), default: pc.model });
        return true;
      }
    } catch {}
    json(res, { models: fallback, default: pc.model });
    return true;
  }

  // grant more tokens to a company (the countdown refills)
  if (req.method === "POST" && url.pathname === "/api/budget") {
    const body = await readBody(req);
    const co = Company.open(root, String(body.company ?? ""));
    const add = Math.max(0, Number(body.addTokens) || 0);
    if (!add) {
      json(res, { error: "addTokens must be a positive number" }, 400);
      return true;
    }
    const meta = co.meta;
    meta.budget.tokens += add;
    writeJson(path.join(co.dir, "company.json"), meta);
    co.audit({ type: "budget.granted", ok: true, detail: `+${add.toLocaleString()} tokens` });
    json(res, { ok: true, budgetTokens: meta.budget.tokens });
    return true;
  }

  return false;
};
