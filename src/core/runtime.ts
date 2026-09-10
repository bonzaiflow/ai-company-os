/** Public runtime surface — tick loop, waves, and queue/priority helpers. */
export type { TickOptions, TickResult } from "./tick-types.js";
export { PRIORITY_RANK, raiseTaskPriority } from "./priority.js";
export { claimReadyWave, flushQueue, requeueStuckRunning } from "./queue.js";
export { tick } from "./tick.js";
export { runLoop, tickWave } from "./loop.js";
