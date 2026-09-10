import type { AiCompanyOsConfig } from "../types.js";
import type { Company } from "./store.js";
import { claimReadyWave, promoteWaitingParents, requeueStuckRunning } from "./queue.js";
import { storeLockFor, tick } from "./tick.js";
import type { TickOptions, TickResult } from "./tick-types.js";

/** Run a dependency-aware wave: claim ready tasks (distinct assignees) and
 * drive their LLM steps concurrently. Store/tool writes are serialized. */
export async function tickWave(
  co: Company,
  cfg: AiCompanyOsConfig,
  opts: TickOptions = {}
): Promise<TickResult[]> {
  if (co.meta.paused) return [{ status: "idle", detail: "company is paused" }];
  const over = co.budgetExceeded();
  if (over) {
    co.audit({ type: "budget.exceeded", ok: false, detail: over });
    return [{ status: "budget", detail: over }];
  }

  const lock = opts.storeLock ?? storeLockFor(co);
  const maxParallel = opts.maxParallel ?? 4;
  const wave = await lock.run(() => {
    if (!co.queue().length) {
      promoteWaitingParents(co);
      requeueStuckRunning(co, 10);
    }
    return claimReadyWave(co, maxParallel);
  });

  if (!wave.length) return [{ status: "idle" }];

  const log = opts.log ?? (() => {});
  if (wave.length > 1) log(`⇉ parallel ×${wave.length}: ${wave.join(", ")}`);

  return Promise.all(
    wave.map((claimedId) =>
      tick(co, cfg, { ...opts, claimedId, storeLock: lock, maxParallel })
    )
  );
}

/** Run ticks until the queue drains, the budget runs out, maxTicks, or
 * shouldStop() returns true (checked between ticks — a tick in flight
 * finishes first). */
export async function runLoop(
  co: Company,
  cfg: AiCompanyOsConfig,
  opts: TickOptions & {
    maxTicks?: number;
    shouldStop?: () => boolean;
    /** on drain, let the chief evaluate goal-delta and emit tasks (default on) */
    replan?: boolean;
    maxReplans?: number;
  } = {}
): Promise<{ ticks: number; stopped: string }> {
  const maxTicks = opts.maxTicks ?? 50;
  const replan = opts.replan ?? true;
  // HARD CONSTRAINT: keep replanning as long as the goal is unmet AND we're
  // still making real headway. Only a genuine stall (a whole replan cycle that
  // barely moved the numbers) counts as exhaustion. A high ceiling is just an
  // infinite-loop backstop, not the normal stopper.
  const maxReplans = opts.maxReplans ?? 200;
  const MIN_CYCLE_PROGRESS = 5; // rows a replan cycle must add or it's exhausted
  let replans = 0;
  let stalls = 0;
  for (let i = 0; i < maxTicks; i++) {
    if (opts.shouldStop?.()) return { ticks: i, stopped: "stopped by user" };
    const results = await tickWave(co, cfg, opts);
    const r =
      results.find((x) => x.status === "stopped") ||
      results.find((x) => x.status === "budget") ||
      results.find((x) => x.status === "provider") ||
      results.find((x) => x.status === "worked") ||
      results[0] ||
      ({ status: "idle" } as TickResult);
    if (r.status === "stopped") return { ticks: i, stopped: "stopped by user" };
    if (r.status === "budget") return { ticks: i, stopped: `budget: ${r.detail}` };
    if (r.status === "provider") {
      return { ticks: i, stopped: `provider unavailable (${r.detail}) — tasks kept, will resume` };
    }
    if (r.status === "idle") {
      // queue drained — the goal is the hard constraint: do not stop while a
      // numeric target is unmet and progress is still possible
      const unmet = (co.meta.targets ?? [])
        .map((t) => ({ t, have: co.measure(t) }))
        .filter((x) => x.have < x.t.count);

      if (replan && unmet.length && replans < maxReplans && !co.meta.paused && !co.budgetExceeded()) {
        const before = unmet.reduce((s, x) => s + x.have, 0);
        replans++;
        opts.log?.(
          `↻ goal unmet (${unmet.map((x) => `${x.t.label} ${x.have}/${x.t.count}`).join(", ")}) — chief replanning [cycle ${replans}]`
        );
        try {
          const { chiefReplan } = await import("./chat.js");
          const created = await chiefReplan(co, cfg);
          if (created.length) {
            opts.log?.(`  ⇒ replan created ${created.map((t) => t.id).join(", ")}`);
            continue; // keep working the new tasks
          }
        } catch (e) {
          opts.log?.(`  ✗ replan failed: ${(e as Error).message}`);
        }
        // replan produced nothing to run, OR the last cycle barely moved:
        // decide exhaustion by measured cross-cycle progress, not by chatter
        const after = unmet.reduce((s, x) => s + co.measure(x.t), 0);
        if (after - before < MIN_CYCLE_PROGRESS) {
          stalls++;
          if (stalls >= 2) {
            return {
              ticks: i,
              stopped: `goal not reachable — 2 replan cycles added <${MIN_CYCLE_PROGRESS} rows (best: ${unmet
                .map((x) => `${x.t.label} ${co.measure(x.t)}/${x.t.count}`)
                .join(", ")}). Sources appear exhausted; owner input needed.`,
            };
          }
        } else {
          stalls = 0;
        }
        continue;
      }
      return { ticks: i, stopped: r.detail ?? "queue empty" };
    }
  }
  return { ticks: maxTicks, stopped: `max ticks (${maxTicks}) — still working, run again to continue` };
}

