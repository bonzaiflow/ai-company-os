import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AiCompanyOsConfig } from "./types.js";
import { readJson, writeJson } from "./util.js";

// NOTE: no default `roles` here on purpose — role overrides must come from an
// actual config file, otherwise they'd silently override per-company providers
const DEFAULT_CONFIG: AiCompanyOsConfig = {
  defaultProvider: "ollama-local",
  providers: {
    "ollama-local": {
      type: "ollama",
      baseUrl: "http://localhost:11434",
      model: "gemma4:12b",
    },
    "ollama-local-small": {
      type: "ollama",
      baseUrl: "http://localhost:11434",
      model: "gemma3:4b",
    },
    "ollama-remote": {
      type: "ollama",
      baseUrl: "http://REMOTE_HOST:11434",
      model: "gemma4:31b",
    },
    openrouter: {
      type: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "google/gemma-4-31b-it:free",
      apiKeyEnv: "OPENROUTER_API_KEY",
    },
    cursor: {
      type: "cursor",
      model: "auto",
      command: "cursor-agent",
    },
    claude: {
      type: "claude",
      model: "sonnet",
      command: "claude",
    },
  },
};

export function configPath(root: string): string {
  const preferred = path.join(root, "ai-company-os.json");
  const legacy = path.join(root, "dmfo.json");
  if (fs.existsSync(preferred) || !fs.existsSync(legacy)) return preferred;
  return legacy;
}

function userConfigPath(): string {
  const preferred = path.join(os.homedir(), ".ai-company-os", "config.json");
  const legacy = path.join(os.homedir(), ".dmfo", "config.json");
  if (fs.existsSync(preferred) || !fs.existsSync(legacy)) return preferred;
  return legacy;
}

/** Project config (./ai-company-os.json) wins over user config (~/.ai-company-os/config.json).
 * Legacy dmfo.json / ~/.dmfo/config.json are still read if the new paths are absent. */
export function loadConfig(root: string): AiCompanyOsConfig {
  const user = readJson<Partial<AiCompanyOsConfig>>(userConfigPath(), {});
  const project = readJson<Partial<AiCompanyOsConfig>>(configPath(root), {});
  return {
    defaultProvider:
      project.defaultProvider ?? user.defaultProvider ?? DEFAULT_CONFIG.defaultProvider,
    roles: { ...user.roles, ...project.roles },
    models: { ...user.models, ...project.models },
    providers: {
      ...DEFAULT_CONFIG.providers,
      ...user.providers,
      ...project.providers,
    },
  };
}

/** Persist role defaults (provider and/or model) into the project config. */
export function saveRoles(
  root: string,
  roles: Record<string, string>,
  models?: Record<string, string>
): void {
  const file = configPath(root);
  const project = readJson<Partial<AiCompanyOsConfig>>(file, {});
  if (Object.keys(roles).length) project.roles = { ...project.roles, ...roles };
  if (models && Object.keys(models).length) project.models = { ...project.models, ...models };
  writeJson(file, project);
}

export function initWorkspace(root: string): string {
  const file = configPath(root);
  if (!fs.existsSync(file)) writeJson(file, DEFAULT_CONFIG);
  fs.mkdirSync(path.join(root, "companies"), { recursive: true });
  fs.mkdirSync(path.join(root, "plans"), { recursive: true });
  fs.mkdirSync(path.join(root, "skills"), { recursive: true });
  return file;
}

/** True when the folder already looks like an AI Company OS workspace. */
export function isWorkspaceInitialized(root: string): boolean {
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) return false;
  if (fs.existsSync(path.join(root, "ai-company-os.json"))) return true;
  if (fs.existsSync(path.join(root, "dmfo.json"))) return true;
  if (fs.existsSync(path.join(root, "companies"))) return true;
  return false;
}

/** Last dashboard workspace from ~/.ai-company-os/config.json, if still valid. */
export function getPersistedWorkspaceRoot(): string | null {
  const user = readJson<Partial<AiCompanyOsConfig>>(userConfigPath(), {});
  const raw = user.workspaceRoot;
  if (!raw || typeof raw !== "string") return null;
  const resolved = path.resolve(raw);
  try {
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) return resolved;
  } catch {
    /* ignore */
  }
  return null;
}

/** Persist the dashboard workspace folder into the user config. */
export function setPersistedWorkspaceRoot(root: string): void {
  const file = userConfigPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const user = readJson<Partial<AiCompanyOsConfig>>(file, {});
  user.workspaceRoot = path.resolve(root);
  writeJson(file, user);
}

/** Boot path for `ai-company-os ui`: persisted workspace, else cwd. */
export function resolveUiWorkspaceRoot(cwd: string = process.cwd()): string {
  return getPersistedWorkspaceRoot() ?? path.resolve(cwd);
}

/**
 * Load KEY=VALUE pairs from .env files into process.env (does not override
 * variables already set in the shell). Looks in cwd first, then optional extra roots.
 */
export function loadDotEnv(...roots: string[]): void {
  const seen = new Set<string>();
  const dirs = [process.cwd(), ...roots.map((r) => path.resolve(r))];
  for (const dir of dirs) {
    const file = path.join(dir, ".env");
    if (seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    const text = fs.readFileSync(file, "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      if (process.env[key] !== undefined) continue; // shell wins
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}
