import path from "node:path";
import type { ConnectorsState } from "../../types.js";
import { readJson, writeJson } from "../../util.js";
import type { Company } from "../store.js";

export function stateFile(co: Company): string {
  return path.join(co.dir, "connectors-state.json");
}

export function loadState(co: Company): ConnectorsState {
  return readJson<ConnectorsState>(stateFile(co), {});
}

export function saveState(co: Company, state: ConnectorsState): void {
  writeJson(stateFile(co), state);
}

/** Resolve a secret from an env var name; throw a clear error if missing. */
export function envSecret(envName: string, label: string): string {
  const name = (envName ?? "").trim();
  if (!name) throw new Error(`${label}: env var name is empty in connector config`);
  const v = process.env[name];
  if (!v) throw new Error(`${label}: env ${name} is not set`);
  return v;
}

/** Public view of connector status (no secret values). */
export function publicState(co: Company): ConnectorsState {
  return loadState(co);
}
