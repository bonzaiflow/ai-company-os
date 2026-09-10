import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../../config.js";
import { flushQueue, raiseTaskPriority, requeueStuckRunning, runLoop, tickWave } from "../../core/runtime.js";
import { Company } from "../../core/store.js";
import { json, readBody } from "../http.js";
import { pushRunnerLog, runnerFor } from "../runners.js";
import { taskDetail } from "../task-detail.js";
import type { RouteHandler } from "./types.js";

/** /api/run/*, /api/task/*, /api/file — runtime controls and task detail. */
export const handleRunRoutes: RouteHandler = async ({ root, req, res, url }) => {
  if (req.method === "GET" && url.pathname === "/api/file") {
    const co = Company.open(root, url.searchParams.get("company") ?? "");
    const rel = url.searchParams.get("path") ?? "";
    const full = path.resolve(co.dir, rel);
    if (full !== co.dir && !full.startsWith(co.dir + path.sep)) {
      json(res, { error: "path escapes company directory" }, 400);
      return true;
    }
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
      json(res, { error: "not found" }, 404);
      return true;
    }
    json(res, { path: rel, content: fs.readFileSync(full, "utf8").slice(0, 100_000) });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/task") {
    const co = Company.open(root, url.searchParams.get("company") ?? "");
    json(res, taskDetail(co, url.searchParams.get("id") ?? ""));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/task/retry") {
    const body = await readBody(req);
    const co = Company.open(root, String(body.company ?? ""));
    const t = co.loadTask(String(body.id ?? ""));
    if (t.status !== "failed") {
      json(res, { error: `${t.id} is ${t.status}, not failed` }, 400);
      return true;
    }
    t.status = "queued";
    t.maxAttempts = (t.attempts ?? 0) + 2; // fresh runway for owner retries
    co.saveTask(t);
    co.enqueue(t.id);
    co.audit({ type: "task.retried", ok: true, taskId: t.id, detail: "by owner (ui)" });
    json(res, { ok: true, id: t.id });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/task/priority") {
    const body = await readBody(req);
    const co = Company.open(root, String(body.company ?? ""));
    const result = raiseTaskPriority(co, String(body.id ?? ""), {
      force: !!body.force,
    });
    if (!result.ok) {
      json(res, { error: result.error, code: result.code }, 400);
      return true;
    }
    json(res, {
      ok: true,
      id: body.id,
      priority: result.priority,
      chain: result.chain,
      moved: result.moved,
      forced: result.forced,
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/task/flush") {
    const body = await readBody(req);
    const co = Company.open(root, String(body.company ?? ""));
    const result = flushQueue(co);
    json(res, {
      ok: true,
      flushed: result.flushed.length,
      ids: result.flushed,
      leftRunning: result.leftRunning.length,
      running: result.leftRunning,
    });
    return true;
  }

  // ---- runtime controls ----

  if (req.method === "GET" && url.pathname === "/api/run/status") {
    const slug = url.searchParams.get("company") ?? "";
    const r = runnerFor(slug);
    json(res, {
      mode: r.mode,
      ticks: r.ticks,
      stopRequested: r.stopRequested,
      lastStopped: r.lastStopped,
      startedAt: r.startedAt,
      log: r.log.slice(-40),
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/run/tick") {
    const body = await readBody(req);
    const slug = String(body.company ?? "");
    const co = Company.open(root, slug);
    const r = runnerFor(slug);
    if (r.mode) {
      json(res, { error: `runner busy (${r.mode})` }, 409);
      return true;
    }
    requeueStuckRunning(co, 0); // resume: recover any task stranded "running"
    r.mode = "tick";
    r.startedAt = new Date().toISOString();
    r.ticks = 0;
    r.stopRequested = false;
    r.log = [];
    void (async () => {
      try {
        const out = await tickWave(co, loadConfig(root), { log: (l) => pushRunnerLog(r, l) });
        const top =
          out.find((x) => x.status !== "idle") || out[0] || { status: "idle" as const };
        r.lastStopped = top.status + (top.detail ? ` (${top.detail})` : "");
      } catch (e) {
        r.lastStopped = "error";
        pushRunnerLog(r, "error: " + (e as Error).message);
      } finally {
        r.mode = null;
      }
    })();
    json(res, { ok: true, started: "tick" });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/run/loop") {
    const body = await readBody(req);
    const slug = String(body.company ?? "");
    const co = Company.open(root, slug);
    const r = runnerFor(slug);
    const action = String(body.action ?? "start");

    if (action === "stop") {
      if (r.mode !== "loop") {
        json(res, { error: "no loop running" }, 409);
        return true;
      }
      r.stopRequested = true;
      json(res, { ok: true, stopping: true });
      return true;
    }

    if (r.mode) {
      json(res, { error: `runner busy (${r.mode})` }, 409);
      return true;
    }
    requeueStuckRunning(co, 0); // resume: recover any task stranded "running"
    r.mode = "loop";
    r.startedAt = new Date().toISOString();
    r.ticks = 0;
    r.stopRequested = false;
    r.log = [];
    void (async () => {
      try {
        const out = await runLoop(co, loadConfig(root), {
          maxTicks: Number(body.maxTicks) || 200,
          maxSteps: Number(body.maxSteps) || undefined,
          replan: body.replan !== false,
          log: (l) => pushRunnerLog(r, l),
          shouldStop: () => r.stopRequested,
        });
        r.lastStopped = out.stopped;
      } catch (e) {
        r.lastStopped = "error";
        pushRunnerLog(r, "error: " + (e as Error).message);
      } finally {
        r.mode = null;
        r.stopRequested = false;
      }
    })();
    json(res, { ok: true, started: "loop" });
    return true;
  }

  return false;
};
