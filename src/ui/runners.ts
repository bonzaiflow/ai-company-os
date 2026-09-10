/** In-process runtime controls (Run tick / Run loop from the UI). */

export interface RunnerState {
  mode: "tick" | "loop" | null;
  startedAt?: string;
  ticks: number;
  stopRequested: boolean;
  lastStopped?: string;
  log: string[];
}

export const runners = new Map<string, RunnerState>();

export function runnerFor(slug: string): RunnerState {
  let r = runners.get(slug);
  if (!r) {
    r = { mode: null, ticks: 0, stopRequested: false, log: [] };
    runners.set(slug, r);
  }
  return r;
}

export function pushRunnerLog(r: RunnerState, line: string): void {
  if (line.startsWith("▶") || line.startsWith("⇉")) r.ticks++;
  r.log.push(line);
  if (r.log.length > 400) r.log.splice(0, r.log.length - 400);
}
