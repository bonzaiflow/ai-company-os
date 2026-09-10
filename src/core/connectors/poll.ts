import type { Company } from "../store.js";
import { pollEmail } from "./email.js";
import { loadState, saveState } from "./state.js";
import { pollTelegram } from "./telegram.js";
import type { PollResult } from "./types.js";
import { nowIso } from "../../util.js";

/** Poll all configured inbound connectors; update connectors-state.json. */
export async function pollConnectors(co: Company): Promise<PollResult> {
  const connectors = co.meta.connectors;
  const errors: string[] = [];
  let ingested = 0;
  if (!connectors) {
    return { ingested: 0, errors: [] };
  }

  if (connectors.email?.imap) {
    try {
      ingested += await pollEmail(co, connectors.email);
    } catch (e) {
      errors.push(`email: ${(e as Error).message}`);
    }
  }

  if (connectors.telegram) {
    try {
      ingested += await pollTelegram(co, connectors.telegram);
    } catch (e) {
      errors.push(`telegram: ${(e as Error).message}`);
    }
  }

  const state = loadState(co);
  state.lastPollAt = nowIso();
  state.lastError = errors.length ? errors.join("; ") : undefined;
  saveState(co, state);

  if (ingested || errors.length) {
    co.audit({
      type: "connector.poll",
      ok: errors.length === 0,
      detail: `ingested=${ingested}` + (errors.length ? ` errors=${errors.join("; ")}` : ""),
    });
  }

  return { ingested, errors };
}
