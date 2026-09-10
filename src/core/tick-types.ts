import type { AsyncMutex } from "../util.js";

export interface TickResult {
  status: "worked" | "idle" | "budget" | "provider" | "stopped";
  taskId?: string;
  detail?: string;
}

export interface TickOptions {
  maxSteps?: number;
  /** live progress callback for the CLI */
  log?: (line: string) => void;
  /** max depth of the delegation tree (root = 0) */
  maxDepth?: number;
  /** cooperative stop — checked between STEPS so a stop lands within one step,
   * not one whole tick. The in-flight task is saved as a clean continuation. */
  shouldStop?: () => boolean;
  /** task already claimed+running (parallel wave); skip dequeue */
  claimedId?: string;
  /** serialize company file writes across parallel ticks */
  storeLock?: AsyncMutex;
  /** max tasks to claim per wave (distinct assignees) */
  maxParallel?: number;
}
