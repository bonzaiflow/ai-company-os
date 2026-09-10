import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);

/** Browser builds served at /vendor/* (allowlisted only). */
function resolveVendor(name: string): string | null {
  try {
    if (name === "cytoscape.min.js") {
      return require.resolve("cytoscape/dist/cytoscape.min.js");
    }
    if (name === "cytoscape-dagre.js") {
      return require.resolve("cytoscape-dagre");
    }
  } catch {
    return null;
  }
  return null;
}

const execFileAsync = promisify(execFile);
import {
  initWorkspace,
  isWorkspaceInitialized,
  loadConfig,
  saveRoles,
  setPersistedWorkspaceRoot,
} from "../config.js";
import { chiefChatStream } from "../core/chat.js";
import { skillNames } from "../core/skills.js";
import { listCheckins } from "../core/checkin.js";
import { exportCompanyZip, type CompanyExportMode } from "../core/export.js";
import { listApprovals } from "../core/governance.js";
import { runDaemon } from "../core/scheduler.js";
import { flushQueue, raiseTaskPriority, requeueStuckRunning, runLoop, tickWave } from "../core/runtime.js";
import { Company } from "../core/store.js";
import { resolveCliCommand } from "../llm/index.js";
import { effectiveAgentLlm } from "../llm/resolve.js";
import type { ChatMessage } from "../types.js";
import { c, slugify, writeJson } from "../util.js";
import { json, readBody } from "./http.js";
import { PAGE } from "./page.js";
import { handleConnectorsRoutes } from "./routes/connectors.js";
import { handleDbRoutes } from "./routes/db.js";
import { handleGovernanceRoutes } from "./routes/governance.js";
import { handlePlansRoutes } from "./routes/plans.js";
import { handleSkillsRoutes } from "./routes/skills.js";
import { handleUploadRoutes } from "./routes/uploads.js";
import { pushRunnerLog, runnerFor, runners } from "./runners.js";
import { taskDetail } from "./task-detail.js";

const LIVE_RELOAD = `<script>
(function () {
  var v;
  setInterval(function () {
    fetch("/api/dev/version")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (v === undefined) v = d.v;
        else if (d.v !== v) location.reload();
      })
      .catch(function () {});
  }, 1000);
})();
</script>`;

function listAgentFiles(co: Company, agent: string): { path: string; size: number }[] {
  const out: { path: string; size: number }[] = [];
  const base = co.agentDir(agent);
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else out.push({ path: path.relative(co.dir, full), size: fs.statSync(full).size });
    }
  };
  for (const sub of ["INBOX", "OUTBOX", "workspace"]) walk(path.join(base, sub));
  if (fs.existsSync(path.join(base, "CHAT.md"))) {
    out.push({
      path: path.relative(co.dir, path.join(base, "CHAT.md")),
      size: fs.statSync(path.join(base, "CHAT.md")).size,
    });
  }
  return out;
}

/** Cheap fingerprint of on-disk company data (sqlite + wal/shm) so the UI
 * can pulse the Data button when something new lands. */
function companyDataSig(co: Company): string {
  const dir = path.join(co.dir, "data");
  if (!fs.existsSync(dir)) return "";
  const parts: string[] = [];
  for (const f of fs.readdirSync(dir).sort()) {
    if (!/\.(db|sqlite|sqlite3)(-wal|-shm)?$/i.test(f)) continue;
    try {
      const st = fs.statSync(path.join(dir, f));
      parts.push(`${f}:${st.size}:${Math.floor(st.mtimeMs)}`);
    } catch {
      /* ignore transient files */
    }
  }
  return parts.join("|");
}

let cursorModelsCache: { at: number; models: string[] } | null = null;

/** `cursor-agent --list-models` prints "id - Label" lines; cache 10 min. */
async function cursorModels(command: string): Promise<string[]> {
  if (cursorModelsCache && Date.now() - cursorModelsCache.at < 600_000) {
    return cursorModelsCache.models;
  }
  try {
    const { stdout } = await execFileAsync(resolveCliCommand(command), ["--list-models"], {
      timeout: 30_000,
    });
    const models = stdout
      .split("\n")
      .map((l) => /^([\w.[\]=,-]+) - /.exec(l.trim())?.[1])
      .filter((m): m is string => !!m);
    if (models.length) {
      cursorModelsCache = { at: Date.now(), models };
      return models;
    }
  } catch (e) {
    console.error("cursor --list-models failed:", (e as Error).message.slice(0, 300));
  }
  return ["auto"];
}

/** Dashboard server. GETs are pure reads of the workspace; POSTs cover the
 * interactive layer: planning (with drafts persisted under plans/), skills
 * management, chat with the chief, and role-default configuration. The
 * runtime itself still runs via `ai-company-os run`. */
export function serveUi(
  initialRoot: string,
  port: number,
  bundledSkillsDir: string,
  opts: { dev?: boolean; daemon?: boolean } = {}
): void {
  let root = path.resolve(initialRoot);
  const dev = opts.dev ?? false;
  const bootId = Date.now();

  function workspacePayload() {
    return { root, initialized: isWorkspaceInitialized(root) };
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    try {
      // every view has a real path (deep-linkable, back/forward works):
      // /  /company/<slug>  /plan/new  /plan/<slug>  /skills  /skills/<name>
      if (
        req.method === "GET" &&
        (url.pathname === "/" || /^\/(company|plan|skills)(\/|$)/.test(url.pathname))
      ) {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(dev ? PAGE.replace("</body>", LIVE_RELOAD + "\n</body>") : PAGE);
        return;
      }

      if (req.method === "GET" && url.pathname.startsWith("/vendor/")) {
        const name = path.basename(url.pathname);
        const file = resolveVendor(name);
        if (!file || !fs.existsSync(file)) {
          res.writeHead(404, { "content-type": "text/plain" });
          res.end("not found");
          return;
        }
        res.writeHead(200, {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": dev ? "no-store" : "public, max-age=86400",
        });
        fs.createReadStream(file).pipe(res);
        return;
      }

      if (dev && req.method === "GET" && url.pathname === "/api/dev/version") {
        json(res, { v: bootId });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/config") {
        const cfg = loadConfig(root);
        json(res, {
          root,
          providers: Object.keys(cfg.providers).filter((p) => cfg.providers[p].type !== "mock"),
          defaultProvider: cfg.defaultProvider,
          roles: cfg.roles ?? {},
          models: cfg.models ?? {},
          skills: skillNames(root, bundledSkillsDir),
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/workspace") {
        json(res, workspacePayload());
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/workspace") {
        const body = await readBody(req);
        const raw = String(body.root ?? "").trim();
        if (!raw) {
          json(res, { error: "root is required" }, 400);
          return;
        }
        const next = path.resolve(raw);
        if (!fs.existsSync(next) || !fs.statSync(next).isDirectory()) {
          json(res, { error: "not a directory: " + next }, 400);
          return;
        }
        if (body.init) initWorkspace(next);
        root = next;
        setPersistedWorkspaceRoot(root);
        console.log(c.dim("workspace → " + root));
        json(res, workspacePayload());
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/workspace/browse") {
        const raw = url.searchParams.get("path") || root || os.homedir();
        let dir = path.resolve(raw);
        if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
          json(res, { error: "not a directory: " + dir }, 400);
          return;
        }
        const parent = path.dirname(dir);
        let entries: { name: string; path: string }[] = [];
        try {
          entries = fs
            .readdirSync(dir, { withFileTypes: true })
            .filter((d) => d.isDirectory() && !d.name.startsWith("."))
            .map((d) => ({ name: d.name, path: path.join(dir, d.name) }))
            .sort((a, b) => a.name.localeCompare(b.name));
        } catch (e) {
          json(res, { error: (e as Error).message }, 403);
          return;
        }
        json(res, {
          path: dir,
          parent: parent !== dir ? parent : null,
          home: os.homedir(),
          initialized: isWorkspaceInitialized(dir),
          entries,
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/config") {
        const body = await readBody(req);
        saveRoles(root, body.roles ?? {}, body.models ?? {});
        json(res, { ok: true });
        return;
      }

      // available models for one provider (source): live from ollama /
      // openrouter, falling back to the configured default model
      if (req.method === "GET" && url.pathname === "/api/models") {
        const cfg = loadConfig(root);
        const name = url.searchParams.get("provider") ?? "";
        const pc = cfg.providers[name];
        if (!pc) {
          json(res, { error: `unknown provider "${name}"` }, 404);
          return;
        }
        const fallback = pc.model ? [pc.model] : [];
        try {
          if (pc.type === "ollama") {
            const r = await fetch(`${pc.baseUrl ?? "http://localhost:11434"}/api/tags`, {
              signal: AbortSignal.timeout(4000),
            });
            const data = (await r.json()) as { models: { name: string }[] };
            const names = data.models.map((m) => m.name).sort();
            json(res, { models: names.length ? names : fallback, default: pc.model });
            return;
          }
          if (pc.type === "cursor") {
            json(res, { models: await cursorModels(pc.command ?? "cursor-agent"), default: pc.model ?? "auto" });
            return;
          }
          if (pc.type === "claude") {
            // Claude Code has no --list-models; offer the aliases + known ids
            json(res, {
              models: ["sonnet", "opus", "haiku", "claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5"],
              default: pc.model ?? "sonnet",
            });
            return;
          }
          if (pc.type === "openrouter") {
            const r = await fetch(`${pc.baseUrl ?? "https://openrouter.ai/api/v1"}/models`, {
              signal: AbortSignal.timeout(6000),
            });
            const data = (await r.json()) as { data: { id: string }[] };
            const ids = data.data.map((m) => m.id);
            // free models first, then the rest alphabetically, capped
            const free = ids.filter((i) => i.endsWith(":free")).sort();
            const paid = ids.filter((i) => !i.endsWith(":free")).sort();
            json(res, { models: [...free, ...paid].slice(0, 300), default: pc.model });
            return;
          }
        } catch {}
        json(res, { models: fallback, default: pc.model });
        return;
      }

      // grant more tokens to a company (the countdown refills)
      if (req.method === "POST" && url.pathname === "/api/budget") {
        const body = await readBody(req);
        const co = Company.open(root, String(body.company ?? ""));
        const add = Math.max(0, Number(body.addTokens) || 0);
        if (!add) {
          json(res, { error: "addTokens must be a positive number" }, 400);
          return;
        }
        const meta = co.meta;
        meta.budget.tokens += add;
        writeJson(path.join(co.dir, "company.json"), meta);
        co.audit({ type: "budget.granted", ok: true, detail: `+${add.toLocaleString()} tokens` });
        json(res, { ok: true, budgetTokens: meta.budget.tokens });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/companies") {
        json(
          res,
          Company.list(root).map((slug) => {
            const co = Company.open(root, slug);
            const meta = co.meta;
            const tasks = co.listTasks();
            const open = tasks.filter((t) => !["done", "failed"].includes(t.status));
            return {
              slug,
              name: meta.name,
              goal: meta.goal,
              agents: co.listAgents().length,
              agentRanks: co.listAgents().map((a) => a.rank),
              tasksTotal: tasks.length,
              tasksOpen: open.length,
              tasksDone: tasks.filter((t) => t.status === "done").length,
              tasksFailed: tasks.filter((t) => t.status === "failed").length,
              running: tasks.some((t) => t.status === "running"),
              queue: co.queue().length,
              spentTokens: co.spent().tokens,
              budgetTokens: meta.budget.tokens,
              updatedAt: tasks.length
                ? tasks.map((t) => t.updatedAt).sort().slice(-1)[0]
                : meta.createdAt,
            };
          })
        );
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/state") {
        const co = Company.open(root, url.searchParams.get("company") ?? "");
        const cfg = loadConfig(root);
        const agents = co.listAgents().map((a) => {
          const profileFile = path.join(co.agentDir(a.name), "profile.md");
          return {
            ...a,
            llm: effectiveAgentLlm(cfg, co, a),
            profile: fs.existsSync(profileFile) ? fs.readFileSync(profileFile, "utf8") : "",
            files: listAgentFiles(co, a.name),
          };
        });
        const checkins = listCheckins(co);
        json(res, {
          meta: co.meta,
          spent: co.spent(),
          agents,
          tasks: co.listTasks(),
          queue: co.queue(),
          audit: co.auditTail(120),
          pendingApprovals: listApprovals(co, "pending").length,
          lastCheckin: checkins.length ? checkins[checkins.length - 1].ts : null,
          chat: co.chatHistory(),
          planningChat: co.planningChatHistory(),
          dataSig: companyDataSig(co),
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/agent/llm") {
        const co = Company.open(root, url.searchParams.get("company") ?? "");
        const name = String(url.searchParams.get("name") ?? "");
        const cfg = loadConfig(root);
        try {
          const agent = co.loadAgent(name);
          json(res, { name: agent.name, llm: effectiveAgentLlm(cfg, co, agent), agent });
        } catch (e) {
          json(res, { error: (e as Error).message }, 404);
        }
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/agent/llm") {
        const body = await readBody(req);
        const co = Company.open(root, String(body.company ?? ""));
        const name = String(body.name ?? "");
        const cfg = loadConfig(root);
        try {
          const agent = co.loadAgent(name);
          if (body.clear) {
            agent.provider = undefined;
            agent.model = undefined;
          } else {
            if (body.provider !== undefined && body.provider !== null && body.provider !== "") {
              const p = String(body.provider);
              if (!cfg.providers[p]) {
                json(res, { error: `unknown provider "${p}"` }, 400);
                return;
              }
              agent.provider = p;
            } else if (body.provider === "" || body.provider === null) {
              agent.provider = undefined;
            }
            if (body.model !== undefined) {
              const m = String(body.model ?? "");
              agent.model = m || undefined;
            }
          }
          co.saveAgent(agent);
          json(res, { ok: true, name: agent.name, llm: effectiveAgentLlm(cfg, co, agent), agent });
        } catch (e) {
          json(res, { error: (e as Error).message }, 400);
        }
        return;
      }

      // ---- governance & perpetuity ----

      if (req.method === "POST" && url.pathname === "/api/company/delete") {
        const body = await readBody(req);
        const slug = slugify(String(body.company ?? body.slug ?? ""));
        if (!slug) {
          json(res, { error: "company slug required" }, 400);
          return;
        }
        const r = runners.get(slug);
        if (r?.mode) {
          r.stopRequested = true;
          json(res, { error: `company is ${r.mode}ing — stop it first, then delete` }, 409);
          return;
        }
        runners.delete(slug);
        Company.delete(root, slug);
        json(res, { ok: true });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/company/export") {
        const slug = slugify(url.searchParams.get("company") ?? "");
        const modeRaw = (url.searchParams.get("mode") ?? "layout").toLowerCase();
        const mode: CompanyExportMode = modeRaw === "full" ? "full" : "layout";
        if (!slug) {
          json(res, { error: "company slug required" }, 400);
          return;
        }
        try {
          const co = Company.open(root, slug);
          const exported = exportCompanyZip(co, mode);
          try {
            const buf = fs.readFileSync(exported.zipPath);
            res.writeHead(200, {
              "content-type": "application/zip",
              "content-disposition": `attachment; filename="${exported.filename}"`,
              "content-length": buf.length,
              "cache-control": "no-store",
            });
            res.end(buf);
            co.audit({
              type: "company.exported",
              ok: true,
              detail: `${mode} → ${exported.filename} (${buf.length} B)`,
            });
          } finally {
            exported.cleanup();
          }
        } catch (e) {
          json(res, { error: (e as Error).message }, 400);
        }
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/company/pause") {
        const body = await readBody(req);
        const co = Company.open(root, String(body.company ?? ""));
        const paused = !!body.paused;
        co.saveMeta({ paused });
        co.audit({ type: paused ? "company.paused" : "company.resumed", ok: true, detail: "by owner (ui)" });
        json(res, { ok: true, paused });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/company/schedule") {
        const body = await readBody(req);
        const co = Company.open(root, String(body.company ?? ""));
        const schedule = {
          everyMinutes: Math.max(1, Number(body.everyMinutes) || 30),
          maxTicks: Math.max(1, Number(body.maxTicks) || 5),
          active: !!body.active,
        };
        co.saveMeta({ schedule });
        co.audit({ type: "company.scheduled", ok: true, detail: JSON.stringify(schedule) });
        json(res, { ok: true, schedule });
        return;
      }

      if (await handleConnectorsRoutes({ root, bundledSkillsDir, req, res, url })) return;
      if (await handleGovernanceRoutes({ root, bundledSkillsDir, req, res, url })) return;

      if (req.method === "GET" && url.pathname === "/api/file") {
        const co = Company.open(root, url.searchParams.get("company") ?? "");
        const rel = url.searchParams.get("path") ?? "";
        const full = path.resolve(co.dir, rel);
        if (full !== co.dir && !full.startsWith(co.dir + path.sep)) {
          json(res, { error: "path escapes company directory" }, 400);
          return;
        }
        if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
          json(res, { error: "not found" }, 404);
          return;
        }
        json(res, { path: rel, content: fs.readFileSync(full, "utf8").slice(0, 100_000) });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/task") {
        const co = Company.open(root, url.searchParams.get("company") ?? "");
        json(res, taskDetail(co, url.searchParams.get("id") ?? ""));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/task/retry") {
        const body = await readBody(req);
        const co = Company.open(root, String(body.company ?? ""));
        const t = co.loadTask(String(body.id ?? ""));
        if (t.status !== "failed") {
          json(res, { error: `${t.id} is ${t.status}, not failed` }, 400);
          return;
        }
        t.status = "queued";
        t.maxAttempts = (t.attempts ?? 0) + 2; // fresh runway for owner retries
        co.saveTask(t);
        co.enqueue(t.id);
        co.audit({ type: "task.retried", ok: true, taskId: t.id, detail: "by owner (ui)" });
        json(res, { ok: true, id: t.id });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/task/priority") {
        const body = await readBody(req);
        const co = Company.open(root, String(body.company ?? ""));
        const result = raiseTaskPriority(co, String(body.id ?? ""), {
          force: !!body.force,
        });
        if (!result.ok) {
          json(res, { error: result.error, code: result.code }, 400);
          return;
        }
        json(res, {
          ok: true,
          id: body.id,
          priority: result.priority,
          chain: result.chain,
          moved: result.moved,
          forced: result.forced,
        });
        return;
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
        return;
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
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/run/tick") {
        const body = await readBody(req);
        const slug = String(body.company ?? "");
        const co = Company.open(root, slug);
        const r = runnerFor(slug);
        if (r.mode) {
          json(res, { error: `runner busy (${r.mode})` }, 409);
          return;
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
        return;
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
            return;
          }
          r.stopRequested = true;
          json(res, { ok: true, stopping: true });
          return;
        }

        if (r.mode) {
          json(res, { error: `runner busy (${r.mode})` }, 409);
          return;
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
        return;
      }

      // ---- planning phase ----
      if (await handlePlansRoutes({ root, bundledSkillsDir, req, res, url })) return;

      // ---- data uploads ----
      if (await handleUploadRoutes({ root, bundledSkillsDir, req, res, url })) return;

      // ---- sqlite browser ----
      if (await handleDbRoutes({ root, bundledSkillsDir, req, res, url })) return;

      // ---- skills ----
      if (await handleSkillsRoutes({ root, bundledSkillsDir, req, res, url })) return;

      // ---- chat with the chief (SSE stream) ----

      if (req.method === "POST" && url.pathname === "/api/chat") {
        const body = await readBody(req);
        const co = Company.open(root, String(body.company ?? ""));
        const cfg = loadConfig(root);
        const history: ChatMessage[] = Array.isArray(body.history) ? body.history : [];
        const message = String(body.message ?? "");
        res.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          "x-accel-buffering": "no",
        });
        res.socket?.setNoDelay(true);
        const writeEvt = (data: unknown) => {
          if (res.writableEnded) return;
          res.write(`data: ${JSON.stringify(data)}\n\n`);
          // compression / proxy helpers sometimes expose flush
          const flushable = res as http.ServerResponse & { flush?: () => void };
          flushable.flush?.();
        };
        try {
          for await (const evt of chiefChatStream(co, cfg, history, message)) {
            if (evt.type === "done") {
              const next: ChatMessage[] = [
                ...history,
                { role: "user", content: message },
                {
                  role: "assistant",
                  content: evt.reply,
                  ...(evt.reasoning ? { reasoning: evt.reasoning } : {}),
                  ...(evt.created.length
                    ? { created: evt.created.map((t) => ({ id: t.id, title: t.title })) }
                    : {}),
                },
              ];
              co.saveChatHistory(next);
            }
            writeEvt(evt);
          }
        } catch (e) {
          writeEvt({ type: "error", error: (e as Error).message });
        }
        if (!res.writableEnded) res.end();
        return;
      }

      res.writeHead(404);
      res.end("not found");
    } catch (e) {
      json(res, { error: (e as Error).message }, 500);
    }
  });

  // boot health check: a broken tool or dead provider must be loud BEFORE
  // agents burn steps on it (dev mode skips it — restarts are constant)
  if (!dev) {
    void import("../core/doctor.js").then(async ({ runDoctor, formatDoctor }) => {
      try {
        const checks = await runDoctor(loadConfig(root));
        const bad = checks.filter((c) => c.level !== "ok");
        if (bad.length) console.log(c.yellow("doctor:\n") + formatDoctor(bad));
      } catch {}
    });
  }

  // recover tasks orphaned in "running" by a previous process being killed
  // (e.g. dev-mode restarts mid-tick) — nothing can be running at our boot
  for (const slug of Company.list(root)) {
    try {
      const n = requeueStuckRunning(Company.open(root, slug), 0);
      if (n) console.log(c.yellow(`recovered ${n} stuck running task(s) in ${slug}`));
    } catch {}
  }

  server.listen(port, () => {
    console.log(c.green(`AI Company OS dashboard → http://localhost:${port}`));
    console.log(c.dim("workspace: " + root));
    if (dev) console.log(c.dim("dev mode — server restarts on rebuild, browser reloads on restart"));
    console.log(c.dim("plan + chat run through your configured providers; `ai-company-os run` executes the queue"));
    if (opts.daemon) {
      console.log(c.green("perpetual mode: waking scheduled companies in this process"));
      void runDaemon(() => root, () => loadConfig(root), {
        intervalSec: 60,
        log: (l) => console.log(c.dim("[daemon] ") + l),
      });
    }
  });
}
