import path from "node:path";
import type { AiCompanyOsConfig, RecurringTask } from "../types.js";
import { nowIso, readJson, writeJson } from "../util.js";
import { runCheckin } from "./checkin.js";
import { runLoop } from "./runtime.js";
import { Company } from "./store.js";

/** Perpetual operation: one daemon wakes every company on its own cadence.
 * A wake = spawn recurring tasks that are due, run the queue for a bounded
 * number of ticks, and write a check-in when one is due. Paused companies
 * and exhausted budgets are always respected. State (lastWakeAt/lastAt)
 * lives in company.json, so the daemon can be restarted at any time. */

function due(lastIso: string | undefined, everyMs: number): boolean {
  if (!lastIso) return true;
  return Date.now() - Date.parse(lastIso) >= everyMs;
}

export function spawnDueRecurring(co: Company, log: (l: string) => void): number {
  const file = path.join(co.dir, "recurring.json");
  const templates = readJson<RecurringTask[]>(file, []);
  if (!templates.length) return 0;
  const chief = co.chief();
  let n = 0;
  for (const t of templates) {
    if (!due(t.lastCreatedAt, t.everyHours * 3_600_000)) continue;
    const task = co.createTask({
      title: t.title,
      description: t.description,
      assignee: t.assignee ?? chief?.name ?? "Chief",
      createdBy: "recurring",
    });
    co.enqueue(task.id);
    t.lastCreatedAt = nowIso();
    n++;
    log(`  ⟳ recurring → ${task.id} "${t.title}"`);
  }
  writeJson(file, templates);
  return n;
}

export async function wakeCompany(
  root: string,
  slug: string,
  cfg: AiCompanyOsConfig,
  log: (l: string) => void
): Promise<void> {
  const co = Company.open(root, slug);
  const meta = co.meta;
  if (meta.paused) return;

  spawnDueRecurring(co, log);

  const sched = meta.schedule;
  if (sched?.active && due(sched.lastWakeAt, sched.everyMinutes * 60_000)) {
    co.saveMeta({ schedule: { ...sched, lastWakeAt: nowIso() } });
    if (co.queue().length || co.listTasks().some((t) => t.status === "waiting")) {
      log(`▷ waking ${slug}`);
      const out = await runLoop(co, cfg, {
        maxTicks: sched.maxTicks ?? 5,
        maxSteps: 30,
        log: (l) => log("  " + l),
      });
      log(`◁ ${slug}: ${out.ticks} tick(s), ${out.stopped}`);
    }
  }

  const ci = meta.checkins;
  if (ci && due(ci.lastAt, ci.everyHours * 3_600_000)) {
    try {
      const c = await runCheckin(co, cfg);
      log(`✉ check-in for ${slug}: stats snapshot`);
    } catch (e) {
      log(`✗ check-in failed for ${slug}: ${(e as Error).message}`);
    }
  }
}

export async function runDaemon(
  root: string,
  loadCfg: () => AiCompanyOsConfig,
  opts: { intervalSec?: number; log?: (l: string) => void; shouldStop?: () => boolean } = {}
): Promise<void> {
  const log = opts.log ?? (() => {});
  const interval = (opts.intervalSec ?? 60) * 1000;
  log(`daemon started — waking companies every ${interval / 1000}s (ctrl-c to stop)`);
  // one company at a time: a single local model host shouldn't be swamped
  for (;;) {
    if (opts.shouldStop?.()) return;
    for (const slug of Company.list(root)) {
      if (opts.shouldStop?.()) return;
      try {
        await wakeCompany(root, slug, loadCfg(), log);
      } catch (e) {
        log(`✗ ${slug}: ${(e as Error).message}`);
      }
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}
