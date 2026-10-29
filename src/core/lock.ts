import fs from "node:fs";
import path from "node:path";

/** Cross-process lock for one company directory. The daemon, the UI server,
 * the MCP server, CLI calls and external agents can all touch the same files;
 * every read-modify-write of shared state (queue, audit chain, budget, task
 * claims) runs inside withCompanyLock so they never interleave.
 *
 * The lock is a `.lock` file created with O_EXCL holding {pid, ts}. It is
 * re-entrant within a process and only ever held around SYNCHRONOUS store
 * work (milliseconds) — never across an LLM or tool call. A lock whose owner
 * died, or that is older than STALE_MS, is taken over. */

const STALE_MS = 30_000;
const WAIT_MS = 15_000;
const held = new Map<string, number>();
const sleeper = new Int32Array(new SharedArrayBuffer(4));

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

function owner(file: string): { pid: number; ts: number } | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as { pid: number; ts: number };
  } catch {
    return null;
  }
}

/** Take over a stale lock: rename it away first so only one contender wins,
 * then make sure what we moved is the lock we judged stale. */
function breakStale(file: string, seen: { pid: number; ts: number } | null): void {
  const moved = `${file}.stale-${process.pid}-${Date.now()}`;
  try {
    fs.renameSync(file, moved);
  } catch {
    return; // someone else got there first
  }
  const got = owner(moved);
  if (seen && got && (got.pid !== seen.pid || got.ts !== seen.ts)) {
    // we raced a fresh lock — put it back if the slot is still free
    try {
      fs.linkSync(moved, file);
    } catch {}
  }
  try {
    fs.unlinkSync(moved);
  } catch {}
}

function acquire(file: string): void {
  const deadline = Date.now() + WAIT_MS;
  for (let wait = 1; ; wait = Math.min(wait * 2, 20)) {
    try {
      const fd = fs.openSync(file, "wx");
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, ts: Date.now() }));
      fs.closeSync(fd);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "ENOENT") fs.mkdirSync(path.dirname(file), { recursive: true });
      else if (code !== "EEXIST") throw e;
    }
    const o = owner(file);
    if (o) {
      const orphan = o.pid === process.pid ? !held.has(file) : !alive(o.pid);
      if (orphan || Date.now() - o.ts > STALE_MS) {
        breakStale(file, o);
        continue;
      }
    } else {
      // empty/half-written file: only stale if it has sat there a while
      try {
        if (Date.now() - fs.statSync(file).mtimeMs > STALE_MS) breakStale(file, null);
      } catch {}
    }
    if (Date.now() > deadline) {
      throw new Error(`company store is locked (${file}, held by pid ${o?.pid ?? "?"})`);
    }
    Atomics.wait(sleeper, 0, 0, wait);
  }
}

/** Run a synchronous critical section under the company's file lock. */
export function withCompanyLock<T>(dir: string, fn: () => T): T {
  const file = path.join(dir, ".lock");
  const depth = held.get(file) ?? 0;
  if (depth === 0) acquire(file);
  held.set(file, depth + 1);
  try {
    const out = fn();
    if (out && typeof (out as { then?: unknown }).then === "function") {
      throw new Error("withCompanyLock needs a synchronous function");
    }
    return out;
  } finally {
    const d = (held.get(file) ?? 1) - 1;
    if (d === 0) {
      held.delete(file);
      try {
        fs.unlinkSync(file);
      } catch {}
    } else {
      held.set(file, d);
    }
  }
}
