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
import {
  deleteSkill,
  deleteSkillFile,
  importSkillArchive,
  listSkills,
  readSkillFile,
  skillNames,
  skillSearchDirs,
  writeSkillFile,
} from "../core/skills.js";
import { listCheckins, runCheckin } from "../core/checkin.js";
import { exportCompanyZip, type CompanyExportMode } from "../core/export.js";
import {
  handleWebhook,
  pollConnectors,
  publicState as connectorPublicState,
  sendEmail,
  sendTelegram,
  postWebhook,
} from "../core/connectors/index.js";
import { decideApproval, listApprovals } from "../core/governance.js";
import { runDaemon } from "../core/scheduler.js";
import { flushQueue, raiseTaskPriority, requeueStuckRunning, runLoop, tick, tickWave } from "../core/runtime.js";
import { Company, scaffoldCompany } from "../core/store.js";
import { createProvider, resolveCliCommand } from "../llm/index.js";
import { resolveHelperLlm, resolveProvider } from "../llm/resolve.js";
import { normalizePlan, planTurn, plannerSystem } from "../planner.js";
import type { AuditEvent, ChatMessage, ConnectorsConfig, Plan, Task } from "../types.js";
import { c, parseFrontmatter, readJson, slugify, writeJson } from "../util.js";
import { PAGE } from "./page.js";

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

function json(res: http.ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (d) => {
      buf += d;
      if (buf.length > 20_000_000) reject(new Error("body too large"));
    });
    req.on("end", () => {
      try {
        resolve(buf ? JSON.parse(buf) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

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

/** Each plan lives in its own folder (plans/<slug>/plan.json + chat.json) so
 * the whole folder can be shared — legacy flat files are still readable. */
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

function planFile(root: string, slug: string): string {
  const foldered = path.join(root, "plans", slug, "plan.json");
  const legacy = path.join(root, "plans", `${slug}.json`);
  return !fs.existsSync(foldered) && fs.existsSync(legacy) ? legacy : foldered;
}
function planChatFile(root: string, slug: string): string {
  const foldered = path.join(root, "plans", slug, "chat.json");
  const legacy = path.join(root, "plans", `${slug}.chat.json`);
  return !fs.existsSync(foldered) && fs.existsSync(legacy) ? legacy : foldered;
}
function deletePlanFiles(root: string, slug: string): void {
  fs.rmSync(path.join(root, "plans", slug), { recursive: true, force: true });
  fs.rmSync(path.join(root, "plans", `${slug}.json`), { force: true });
  fs.rmSync(path.join(root, "plans", `${slug}.chat.json`), { force: true });
}

// ---- task detail ----

function taskAudit(co: Company, id: string): AuditEvent[] {
  const file = path.join(co.dir, "audit.jsonl");
  if (!fs.existsSync(file)) return [];
  const out: AuditEvent[] = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as AuditEvent;
      if (e.taskId === id) out.push(e);
    } catch {}
  }
  return out.slice(-200);
}

function taskMessages(co: Company, id: string) {
  const out: {
    agent: string;
    box: string;
    from: string;
    to: string;
    subject: string;
    sentAt: string;
    content: string;
  }[] = [];
  for (const a of co.listAgents()) {
    for (const box of ["INBOX", path.join("INBOX", "read"), "OUTBOX"]) {
      const dir = path.join(co.agentDir(a.name), box);
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (!f.startsWith(id) || !f.endsWith(".md")) continue;
        const { meta, body } = parseFrontmatter(fs.readFileSync(path.join(dir, f), "utf8"));
        out.push({
          agent: a.name,
          box: box.startsWith("INBOX") ? "inbox" : "outbox",
          from: meta.from ?? "?",
          to: meta.to ?? a.name,
          subject: meta.subject ?? "",
          sentAt: meta.sentAt ?? "",
          content: body.trim().slice(0, 2000),
        });
      }
    }
  }
  // inbox + its read/ copy are the same physical message moved, not two sends
  const seen = new Set<string>();
  return out
    .filter((m) => {
      const key = m.box + "|" + m.from + "|" + m.to + "|" + m.subject + "|" + m.sentAt;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((x, y) => x.sentAt.localeCompare(y.sentAt));
}

function taskDetail(co: Company, id: string) {
  const task = co.loadTask(id);
  const shallow = (t: Task) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    assignee: t.assignee,
    result: t.result ? t.result.slice(0, 500) : undefined,
  });
  const thoughtsFile = path.join(co.agentDir(task.assignee), "workspace", `${id}.md`);
  const queue = co.queue();
  return {
    task,
    raw: fs.readFileSync(co.taskFile(id), "utf8"),
    parent: task.parent ? shallow(co.loadTask(task.parent)) : null,
    children: co.children(id).map(shallow),
    audit: taskAudit(co, id),
    thoughts: fs.existsSync(thoughtsFile)
      ? fs.readFileSync(thoughtsFile, "utf8").slice(-30_000)
      : "",
    messages: taskMessages(co, id),
    queuePos: queue.indexOf(id),
    queueLen: queue.length,
  };
}

// ---- in-process runtime controls (Run tick / Run loop from the UI) ----

interface RunnerState {
  mode: "tick" | "loop" | null;
  startedAt?: string;
  ticks: number;
  stopRequested: boolean;
  lastStopped?: string;
  log: string[];
}

const runners = new Map<string, RunnerState>();

function runnerFor(slug: string): RunnerState {
  let r = runners.get(slug);
  if (!r) {
    r = { mode: null, ticks: 0, stopRequested: false, log: [] };
    runners.set(slug, r);
  }
  return r;
}

function pushRunnerLog(r: RunnerState, line: string): void {
  if (line.startsWith("▶") || line.startsWith("⇉")) r.ticks++;
  r.log.push(line);
  if (r.log.length > 400) r.log.splice(0, r.log.length - 400);
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
        const agents = co.listAgents().map((a) => {
          const profileFile = path.join(co.agentDir(a.name), "profile.md");
          return {
            ...a,
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

      if (req.method === "GET" && url.pathname === "/api/connectors") {
        const co = Company.open(root, url.searchParams.get("company") ?? "");
        const connectors = co.meta.connectors ?? {};
        const envSet = (name?: string) => !!(name && process.env[name]);
        json(res, {
          connectors,
          state: connectorPublicState(co),
          secrets: {
            emailSmtp: envSet(connectors.email?.smtp?.passEnv),
            emailImap: envSet(connectors.email?.imap?.passEnv),
            telegram: envSet(connectors.telegram?.botTokenEnv),
            webhook: envSet(connectors.webhook?.inboundSecretEnv),
          },
          hookPath: `/api/hooks/${co.meta.slug}`,
          agents: co.listAgents().map((a) => a.name),
          approveTools: co.meta.policies?.approveTools ?? [],
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/connectors") {
        const body = await readBody(req);
        const co = Company.open(root, String(body.company ?? ""));
        const connectors = (body.connectors ?? {}) as ConnectorsConfig;
        // Strip empty connector blocks so disabled = absent
        const cleaned: ConnectorsConfig = {};
        if (connectors.email?.smtp?.host && connectors.email?.smtp?.user) {
          cleaned.email = connectors.email;
        }
        if (connectors.telegram?.botTokenEnv) {
          cleaned.telegram = connectors.telegram;
        }
        if (connectors.webhook?.inboundSecretEnv) {
          cleaned.webhook = connectors.webhook;
        }
        const patch: { connectors: ConnectorsConfig; policies?: { approveTools?: string[] } } = {
          connectors: cleaned,
        };
        if (body.gateOutbound) {
          const current = new Set(co.meta.policies?.approveTools ?? []);
          for (const t of ["email", "telegram", "webhook"]) current.add(t);
          patch.policies = { ...(co.meta.policies ?? {}), approveTools: [...current] };
        }
        co.saveMeta(patch);
        co.audit({
          type: "connectors.saved",
          ok: true,
          detail: Object.keys(cleaned).join(",") || "(none)",
        });
        json(res, { ok: true, connectors: cleaned });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/connectors/poll") {
        const body = await readBody(req);
        const co = Company.open(root, String(body.company ?? ""));
        const result = await pollConnectors(co);
        json(res, { ok: true, ...result, state: connectorPublicState(co) });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/connectors/test") {
        const body = await readBody(req);
        const co = Company.open(root, String(body.company ?? ""));
        const kind = String(body.kind ?? "");
        const cfg = co.meta.connectors;
        try {
          if (kind === "email") {
            if (!cfg?.email) throw new Error("email connector not configured");
            const to = String(body.to || cfg.email.from || cfg.email.smtp.user);
            const msg = await sendEmail(cfg.email, {
              to,
              subject: "[ai-company-os] test email",
              body: `Test from company ${co.meta.slug} at ${new Date().toISOString()}`,
            });
            json(res, { ok: true, detail: msg });
            return;
          }
          if (kind === "telegram") {
            if (!cfg?.telegram) throw new Error("telegram connector not configured");
            const chatId = String(body.chatId || cfg.telegram.allowedChatIds?.[0] || "");
            if (!chatId) throw new Error("chatId required (or set allowedChatIds[0])");
            const msg = await sendTelegram(cfg.telegram, {
              chatId,
              text: `Test from ai-company-os company ${co.meta.slug}`,
            });
            json(res, { ok: true, detail: msg });
            return;
          }
          if (kind === "webhook") {
            const urlOut = String(body.url || "");
            if (!urlOut) throw new Error("url required for webhook test");
            const msg = await postWebhook(cfg?.webhook, {
              url: urlOut,
              body: { text: `test from ${co.meta.slug}`, from: "ai-company-os" },
            });
            json(res, { ok: true, detail: msg });
            return;
          }
          json(res, { error: "kind must be email|telegram|webhook" }, 400);
        } catch (e) {
          json(res, { error: (e as Error).message }, 400);
        }
        return;
      }

      {
        const hookMatch = /^\/api\/hooks\/([^/]+)$/.exec(url.pathname);
        if (req.method === "POST" && hookMatch) {
          const slug = decodeURIComponent(hookMatch[1]);
          const co = Company.open(root, slug);
          const wh = co.meta.connectors?.webhook;
          if (!wh?.inboundSecretEnv) {
            json(res, { error: "webhook connector not configured for this company" }, 404);
            return;
          }
          const secret =
            (req.headers["x-connector-secret"] as string | undefined) ||
            url.searchParams.get("secret") ||
            undefined;
          const body = await readBody(req);
          try {
            const result = handleWebhook(co, wh, body, secret);
            json(res, { ok: true, ...result });
          } catch (e) {
            const msg = (e as Error).message;
            json(res, { error: msg }, msg.includes("secret") ? 401 : 400);
          }
          return;
        }
      }

      if (req.method === "GET" && url.pathname === "/api/approvals") {
        const co = Company.open(root, url.searchParams.get("company") ?? "");
        json(res, listApprovals(co));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/approvals/decide") {
        const body = await readBody(req);
        const co = Company.open(root, String(body.company ?? ""));
        const a = decideApproval(co, String(body.id ?? ""), !!body.approve, body.note ? String(body.note) : undefined);
        json(res, { ok: true, status: a.status });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/checkins") {
        const co = Company.open(root, url.searchParams.get("company") ?? "");
        json(res, listCheckins(co).reverse());
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/checkin") {
        const body = await readBody(req);
        const co = Company.open(root, String(body.company ?? ""));
        const ci = await runCheckin(co, loadConfig(root));
        json(res, ci);
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/audit/export") {
        const co = Company.open(root, url.searchParams.get("company") ?? "");
        const file = path.join(co.dir, "audit.jsonl");
        res.writeHead(200, {
          "content-type": "application/x-ndjson",
          "content-disposition": `attachment; filename="${co.meta.slug}-audit.jsonl"`,
        });
        res.end(fs.existsSync(file) ? fs.readFileSync(file) : "");
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/audit/verify") {
        const co = Company.open(root, url.searchParams.get("company") ?? "");
        const bad = co.verifyAudit();
        json(res, { intact: !bad, problem: bad });
        return;
      }

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

      if (req.method === "GET" && url.pathname === "/api/plans") {
        const dir = path.join(root, "plans");
        const out: unknown[] = [];
        const seen = new Set<string>();
        if (fs.existsSync(dir)) {
          for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
            let slug: string | null = null;
            if (f.isDirectory() && fs.existsSync(path.join(dir, f.name, "plan.json"))) {
              slug = f.name;
            } else if (f.isFile() && f.name.endsWith(".json") && !f.name.endsWith(".chat.json")) {
              slug = f.name.replace(/\.json$/, "");
            }
            if (!slug || seen.has(slug)) continue;
            seen.add(slug);
            const plan = readJson<Plan | null>(planFile(root, slug), null);
            if (plan) {
              out.push({ slug, name: plan.name, goal: plan.goal, agents: plan.agents?.length ?? 0 });
            }
          }
        }
        json(res, out);
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/plan") {
        const slug = url.searchParams.get("slug") ?? "";
        json(res, {
          plan: readJson<Plan | null>(planFile(root, slug), null),
          history: readJson<ChatMessage[]>(planChatFile(root, slug), []),
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/plan/chat") {
        const body = await readBody(req);
        const cfg = loadConfig(root);
        const provider = resolveProvider(cfg, {
          role: "planning",
          request: {
            provider: body.provider || undefined,
            model: body.model || undefined,
          },
        });
        const history: ChatMessage[] = Array.isArray(body.history) ? body.history : [];
        // the planner should know about data the owner already uploaded
        let uploadsNote = "";
        const upDir = body.slug ? path.join(root, "plans", String(body.slug), "uploads") : "";
        if (upDir && fs.existsSync(upDir)) {
          const files = fs.readdirSync(upDir);
          if (files.length) {
            uploadsNote =
              `\n\nThe owner has ALREADY uploaded data files that will be available to the company at ` +
              `data/uploads/: ${files.join(", ")}. Plan around this: agents can import them with the ` +
              `importdata tool instead of re-discovering from scratch.`;
          }
        }
        const turn = await planTurn(provider, [
          { role: "system", content: plannerSystem(skillNames(root, bundledSkillsDir)) + uploadsNote },
          ...history.slice(-16),
        ]);

        // persist the draft in its own shareable folder (migrates legacy flat files)
        const slug = body.slug || slugify(turn.plan.name);
        fs.rmSync(path.join(root, "plans", `${slug}.json`), { force: true });
        fs.rmSync(path.join(root, "plans", `${slug}.chat.json`), { force: true });
        writeJson(path.join(root, "plans", slug, "plan.json"), turn.plan);
        writeJson(path.join(root, "plans", slug, "chat.json"), [
          ...history,
          { role: "assistant", content: JSON.stringify(turn) },
        ]);
        json(res, { ...turn, slug });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/plan/delete") {
        const body = await readBody(req);
        deletePlanFiles(root, slugify(String(body.slug ?? "")));
        json(res, { ok: true });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/plan/launch") {
        const body = await readBody(req);
        const cfg = loadConfig(root);
        const plan = normalizePlan(body.plan as Plan);
        if (body.name) plan.name = String(body.name);
        const planSlug = body.slug ? String(body.slug) : slugify(plan.name);
        const planningHistory = readJson<ChatMessage[]>(planChatFile(root, planSlug), []);
        const co = scaffoldCompany(
          root,
          plan,
          skillSearchDirs(root, bundledSkillsDir),
          body.provider || cfg.roles?.agents || cfg.defaultProvider,
          body.model || undefined
        );
        if (Array.isArray(planningHistory) && planningHistory.length) {
          co.savePlanningChat(planningHistory);
        }
        // carry plan-phase uploads into the company so agents can importdata them
        const planUploads = path.join(root, "plans", planSlug, "uploads");
        if (fs.existsSync(planUploads)) {
          const dest = path.join(co.dir, "data", "uploads");
          fs.mkdirSync(dest, { recursive: true });
          for (const f of fs.readdirSync(planUploads)) {
            fs.copyFileSync(path.join(planUploads, f), path.join(dest, f));
          }
          co.audit({ type: "upload.received", ok: true, detail: `from plan: ${fs.readdirSync(planUploads).join(", ")}` });
        }
        deletePlanFiles(root, planSlug);
        json(res, { slug: co.meta.slug, name: co.meta.name });
        return;
      }

      // ---- sqlite browser ----

      // ---- data uploads (overpass-turbo JSON/GeoJSON/CSV, or any data file) ----

      // into a company (chief chat): saved to data/uploads/, parse-previewed
      if (req.method === "POST" && url.pathname === "/api/upload") {
        const body = await readBody(req);
        const co = Company.open(root, String(body.company ?? ""));
        const name = String(body.filename ?? "upload").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
        const dir = path.join(co.dir, "data", "uploads");
        fs.mkdirSync(dir, { recursive: true });
        const buf = Buffer.from(String(body.dataBase64 ?? ""), "base64");
        if (buf.length > 15_000_000) return json(res, { error: "file too large (15MB max)" }, 400);
        fs.writeFileSync(path.join(dir, name), buf);
        co.audit({ type: "upload.received", ok: true, detail: `data/uploads/${name} (${buf.length} B)` });
        let preview: { rows: number; withEmail: number; sample: string[] } | null = null;
        let parseError: string | null = null;
        try {
          const { parseBusinessFile } = await import("../core/tools.js");
          const parsed = parseBusinessFile(buf.toString("utf8"), name);
          preview = {
            rows: parsed.length,
            withEmail: parsed.filter((b) => b.email).length,
            sample: parsed.slice(0, 3).map((b) => b.name),
          };
        } catch (e) {
          parseError = e instanceof Error ? e.message : String(e);
        }
        json(res, { ok: true, path: `data/uploads/${name}`, preview, parseError, bytes: buf.length });
        return;
      }

      // into a plan draft: saved to plans/<slug>/uploads/, copied into the
      // company's data/uploads at launch
      if (req.method === "POST" && url.pathname === "/api/plan/upload") {
        const body = await readBody(req);
        const slug = slugify(String(body.slug ?? "")) || `plan-${Date.now()}`;
        const name = String(body.filename ?? "upload").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
        const dir = path.join(root, "plans", slug, "uploads");
        fs.mkdirSync(dir, { recursive: true });
        const buf = Buffer.from(String(body.dataBase64 ?? ""), "base64");
        if (buf.length > 15_000_000) return json(res, { error: "file too large (15MB max)" }, 400);
        fs.writeFileSync(path.join(dir, name), buf);
        let preview: { rows: number; withEmail: number } | null = null;
        let parseError: string | null = null;
        try {
          const { parseBusinessFile } = await import("../core/tools.js");
          const parsed = parseBusinessFile(buf.toString("utf8"), name);
          preview = { rows: parsed.length, withEmail: parsed.filter((b) => b.email).length };
        } catch (e) {
          parseError = e instanceof Error ? e.message : String(e);
        }
        json(res, { ok: true, slug, path: `uploads/${name}`, preview, parseError, bytes: buf.length });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/db/list") {
        const co = Company.open(root, url.searchParams.get("company") ?? "");
        const dir = path.join(co.dir, "data");
        const out: {
          db: string;
          bytes: number;
          tables: { name: string; rows: number; columns: string[] }[];
        }[] = [];
        if (fs.existsSync(dir)) {
          for (const f of fs.readdirSync(dir)) {
            if (!/\.(db|sqlite|sqlite3)$/i.test(f)) continue;
            try {
              const bytes = fs.statSync(path.join(dir, f)).size;
              // read-only: opening the loop's live DB must never risk a write lock
              const db = new DatabaseSync(path.join(dir, f), { readOnly: true });
              const tables = (
                db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]
              ).map((t) => {
                const n = db.prepare(`SELECT COUNT(*) AS n FROM "${t.name}"`).get() as { n: number };
                const cols = (db.prepare(`PRAGMA table_info("${t.name}")`).all() as { name: string }[]).map(
                  (c) => c.name
                );
                return { name: t.name, rows: n.n, columns: cols };
              });
              db.close();
              out.push({ db: f, bytes, tables });
            } catch {}
          }
        }
        json(res, out);
        return;
      }

      // paginated / sorted / filtered read of one table (read-only, safe on a
      // DB another process is writing). params: db, table, page, pageSize,
      // sort, dir, q (global text search), and f_<col>=<substr> column filters.
      if (req.method === "GET" && url.pathname === "/api/db/table") {
        const co = Company.open(root, url.searchParams.get("company") ?? "");
        const dbName = url.searchParams.get("db") ?? "";
        const table = url.searchParams.get("table") ?? "";
        if (!/^[\w.-]+$/.test(dbName)) return json(res, { error: "invalid db name" }, 400);
        const dbPath = path.join(co.dir, "data", dbName);
        if (!fs.existsSync(dbPath)) return json(res, { error: "no such database" }, 404);
        let db: InstanceType<typeof DatabaseSync> | null = null;
        try {
          db = new DatabaseSync(dbPath, { readOnly: true });
          // validate identifiers against the real schema (no injection via names)
          const tableNames = (
            db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
          ).map((t) => t.name);
          if (!tableNames.includes(table)) return json(res, { error: "no such table" }, 404);
          const cols = (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map(
            (c) => c.name
          );
          const colSet = new Set(cols);

          const pageSize = Math.min(500, Math.max(10, Number(url.searchParams.get("pageSize")) || 50));
          const page = Math.max(0, Number(url.searchParams.get("page")) || 0);
          const sort = url.searchParams.get("sort") ?? "";
          const dir = url.searchParams.get("dir") === "desc" ? "DESC" : "ASC";
          const q = (url.searchParams.get("q") ?? "").trim();

          // WHERE from per-column filters (f_<col>) + global q across all columns
          const where: string[] = [];
          const params: unknown[] = [];
          for (const [k, v] of url.searchParams) {
            if (!k.startsWith("f_") || !v) continue;
            const col = k.slice(2);
            if (!colSet.has(col)) continue;
            where.push(`"${col}" LIKE ?`);
            params.push(`%${v}%`);
          }
          if (q) {
            where.push("(" + cols.map((c) => `CAST("${c}" AS TEXT) LIKE ?`).join(" OR ") + ")");
            cols.forEach(() => params.push(`%${q}%`));
          }
          const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
          const orderSql = sort && colSet.has(sort) ? ` ORDER BY "${sort}" ${dir}` : "";

          const total = (
            db.prepare(`SELECT COUNT(*) AS n FROM "${table}"${whereSql}`).get(...(params as never[])) as {
              n: number;
            }
          ).n;
          const rows = db
            .prepare(`SELECT * FROM "${table}"${whereSql}${orderSql} LIMIT ? OFFSET ?`)
            .all(...([...params, pageSize, page * pageSize] as never[])) as Record<string, unknown>[];

          json(res, {
            columns: cols,
            rows: rows.map((r) => cols.map((c) => r[c])),
            total,
            page,
            pageSize,
            pages: Math.max(1, Math.ceil(total / pageSize)),
          });
        } catch (e) {
          json(res, { error: (e as Error).message }, 400);
        } finally {
          db?.close();
        }
        return;
      }

      // CSV export of a table with the same filters/sort as /api/db/table (no pagination).
      if (req.method === "GET" && url.pathname === "/api/db/export") {
        const co = Company.open(root, url.searchParams.get("company") ?? "");
        const dbName = url.searchParams.get("db") ?? "";
        const table = url.searchParams.get("table") ?? "";
        if (!/^[\w.-]+$/.test(dbName)) return json(res, { error: "invalid db name" }, 400);
        if (!/^[A-Za-z_][\w]*$/.test(table)) return json(res, { error: "invalid table name" }, 400);
        const dbPath = path.join(co.dir, "data", dbName);
        if (!fs.existsSync(dbPath)) return json(res, { error: "no such database" }, 404);
        let db: InstanceType<typeof DatabaseSync> | null = null;
        try {
          db = new DatabaseSync(dbPath, { readOnly: true });
          const tableNames = (
            db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
          ).map((t) => t.name);
          if (!tableNames.includes(table)) return json(res, { error: "no such table" }, 404);
          const cols = (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map(
            (c) => c.name
          );
          const colSet = new Set(cols);
          const sort = url.searchParams.get("sort") ?? "";
          const dir = url.searchParams.get("dir") === "desc" ? "DESC" : "ASC";
          const q = (url.searchParams.get("q") ?? "").trim();
          const where: string[] = [];
          const params: unknown[] = [];
          for (const [k, v] of url.searchParams) {
            if (!k.startsWith("f_") || !v) continue;
            const col = k.slice(2);
            if (!colSet.has(col)) continue;
            where.push(`"${col}" LIKE ?`);
            params.push(`%${v}%`);
          }
          if (q) {
            where.push("(" + cols.map((c) => `CAST("${c}" AS TEXT) LIKE ?`).join(" OR ") + ")");
            cols.forEach(() => params.push(`%${q}%`));
          }
          const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
          const orderSql = sort && colSet.has(sort) ? ` ORDER BY "${sort}" ${dir}` : "";
          const EXPORT_CAP = 100_000;
          const rows = db
            .prepare(`SELECT * FROM "${table}"${whereSql}${orderSql} LIMIT ?`)
            .all(...([...params, EXPORT_CAP] as never[])) as Record<string, unknown>[];

          const esc = (v: unknown): string => {
            if (v === null || v === undefined) return "";
            const s = String(v);
            if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
            return s;
          };
          const lines = [cols.map(esc).join(",")];
          for (const r of rows) lines.push(cols.map((c) => esc(r[c])).join(","));
          const csv = lines.join("\n") + "\n";
          const safeTable = table.replace(/[^\w.-]+/g, "_");
          const safeDb = dbName.replace(/[^\w.-]+/g, "_");
          res.writeHead(200, {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="${safeDb}-${safeTable}.csv"`,
            "cache-control": "no-store",
          });
          res.end(csv);
        } catch (e) {
          json(res, { error: (e as Error).message }, 400);
        } finally {
          db?.close();
        }
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/db/query") {
        const body = await readBody(req);
        const co = Company.open(root, String(body.company ?? ""));
        const dbName = String(body.db ?? "");
        if (!/^[\w.-]+$/.test(dbName)) {
          json(res, { error: "invalid db name" }, 400);
          return;
        }
        const dbPath = path.join(co.dir, "data", dbName);
        if (!fs.existsSync(dbPath)) {
          json(res, { error: `no such database ${dbName}` }, 404);
          return;
        }
        const sql = String(body.sql ?? "").trim();
        if (!/^\s*(select|pragma|with|explain)/i.test(sql)) {
          json(res, { error: "read-only browser: only SELECT / PRAGMA / WITH queries" }, 400);
          return;
        }
        try {
          const db = new DatabaseSync(dbPath, { readOnly: true });
          const rows = db.prepare(sql).all() as Record<string, unknown>[];
          db.close();
          const limited = rows.slice(0, 200);
          const columns = limited.length ? Object.keys(limited[0]) : [];
          json(res, {
            columns,
            rows: limited.map((r) => columns.map((c) => r[c])),
            total: rows.length,
            truncated: rows.length > 200,
          });
        } catch (e) {
          json(res, { error: (e as Error).message }, 400);
        }
        return;
      }

      // Natural-language → read-only SQL (execution model, else agents).
      if (req.method === "POST" && url.pathname === "/api/db/prompt") {
        const body = await readBody(req);
        const co = Company.open(root, String(body.company ?? ""));
        const dbName = String(body.db ?? "");
        const prompt = String(body.prompt ?? "").trim();
        const focusTable = String(body.table ?? "").trim();
        if (!prompt) {
          json(res, { error: "prompt required" }, 400);
          return;
        }
        if (!/^[\w.-]+$/.test(dbName)) {
          json(res, { error: "invalid db name" }, 400);
          return;
        }
        const dbPath = path.join(co.dir, "data", dbName);
        if (!fs.existsSync(dbPath)) {
          json(res, { error: `no such database ${dbName}` }, 404);
          return;
        }

        let schemaText = "";
        try {
          const db = new DatabaseSync(dbPath, { readOnly: true });
          const tables = (
            db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
              name: string;
            }[]
          ).map((t) => t.name);
          const lines: string[] = [];
          for (const name of tables) {
            const cols = db.prepare(`PRAGMA table_info("${name}")`).all() as {
              name: string;
              type: string;
              notnull: number;
              pk: number;
            }[];
            const colDesc = cols
              .map((c) => {
                const bits = [c.name, c.type || "ANY"];
                if (c.pk) bits.push("PK");
                if (c.notnull) bits.push("NOT NULL");
                return bits.join(" ");
              })
              .join(", ");
            lines.push(`- ${name} (${colDesc})`);
          }
          db.close();
          schemaText = lines.length ? lines.join("\n") : "(no tables)";
        } catch (e) {
          json(res, { error: (e as Error).message }, 400);
          return;
        }

        const cfg = loadConfig(root);
        const meta = co.meta;
        const resolved = resolveHelperLlm(cfg, meta);
        let provider;
        try {
          provider = createProvider(cfg, resolved.provider, resolved.model);
        } catch (e) {
          json(res, { error: (e as Error).message }, 400);
          return;
        }

        const system =
          "You write SQLite read-only queries for a data browser.\n" +
          "Rules:\n" +
          "- Reply with ONLY one SQL statement. No prose, no markdown fences, no comments.\n" +
          "- Allowed: SELECT, WITH (CTE), PRAGMA, EXPLAIN. Never write/modify data.\n" +
          "- Use double-quoted identifiers when needed. Prefer LIMIT 50 unless the user asks otherwise.\n" +
          "- Stick to the schema below; do not invent tables or columns.\n" +
          (focusTable ? `- The user is currently viewing table "${focusTable}". Prefer it when relevant.\n` : "") +
          `\nDatabase file: ${dbName}\nSchema:\n${schemaText}`;

        try {
          const result = await provider.chat([
            { role: "system", content: system },
            { role: "user", content: prompt },
          ]);
          let sql = String(result.content ?? "").trim();
          const fence = sql.match(/```(?:sql|sqlite)?\s*([\s\S]*?)```/i);
          if (fence) sql = fence[1].trim();
          sql = sql.replace(/;+\s*$/, "").trim();
          if (!/^\s*(select|pragma|with|explain)/i.test(sql)) {
            json(
              res,
              {
                error: "model did not return a read-only query",
                raw: String(result.content ?? "").slice(0, 500),
              },
              400
            );
            return;
          }
          json(res, {
            sql,
            role: resolved.roleKind,
            provider: provider.name,
            model: provider.model,
          });
        } catch (e) {
          json(res, { error: (e as Error).message }, 500);
        }
        return;
      }

      // ---- skills ----

      if (req.method === "GET" && url.pathname === "/api/skills") {
        json(res, listSkills(root, bundledSkillsDir));
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/skills/file") {
        try {
          const name = String(url.searchParams.get("name") ?? "");
          const file = String(url.searchParams.get("path") ?? "SKILL.md");
          json(res, readSkillFile(root, bundledSkillsDir, name, file));
        } catch (e) {
          json(res, { error: (e as Error).message }, 400);
        }
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/skills/save") {
        const body = await readBody(req);
        try {
          const saved = writeSkillFile(
            root,
            bundledSkillsDir,
            String(body.name ?? ""),
            String(body.path ?? "SKILL.md"),
            String(body.content ?? "")
          );
          json(res, { ok: true, name: saved.name, path: saved.path });
        } catch (e) {
          json(res, { error: (e as Error).message }, 400);
        }
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/skills/file/delete") {
        const body = await readBody(req);
        try {
          deleteSkillFile(root, String(body.name ?? ""), String(body.path ?? ""));
          json(res, { ok: true });
        } catch (e) {
          json(res, { error: (e as Error).message }, 400);
        }
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/skills/delete") {
        const body = await readBody(req);
        try {
          deleteSkill(root, String(body.name ?? ""));
          json(res, { ok: true });
        } catch (e) {
          json(res, { error: (e as Error).message }, 400);
        }
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/skills/upload") {
        const body = await readBody(req);
        try {
          const imported = importSkillArchive(
            root,
            String(body.filename ?? "upload.zip"),
            Buffer.from(String(body.dataBase64 ?? ""), "base64")
          );
          json(res, { ok: true, imported });
        } catch (e) {
          json(res, { error: (e as Error).message }, 400);
        }
        return;
      }

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
