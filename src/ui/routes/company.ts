import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { loadConfig } from "../../config.js";
import { chiefChatStream } from "../../core/chat.js";
import { listCheckins } from "../../core/checkin.js";
import { exportCompanyZip, type CompanyExportMode } from "../../core/export.js";
import { listApprovals } from "../../core/governance.js";
import { Company } from "../../core/store.js";
import { effectiveAgentLlm } from "../../llm/resolve.js";
import type { ChatMessage } from "../../types.js";
import { slugify } from "../../util.js";
import { json, readBody } from "../http.js";
import { runners } from "../runners.js";
import type { RouteHandler } from "./types.js";

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

/** /api/companies, /api/state, /api/agent/llm, /api/company/*, /api/chat. */
export const handleCompanyRoutes: RouteHandler = async ({ root, req, res, url }) => {
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
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    const co = Company.open(root, url.searchParams.get("company") ?? "");
    const cfg = loadConfig(root);
    const agents = co.listAgents().map((a) => {
      const profileFile = path.join(co.agentDir(a.name), "profile.md");
      return {
        ...a,
        llm: effectiveAgentLlm(cfg, co.meta, a),
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
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/agent/llm") {
    const co = Company.open(root, url.searchParams.get("company") ?? "");
    const name = String(url.searchParams.get("name") ?? "");
    const cfg = loadConfig(root);
    try {
      const agent = co.loadAgent(name);
      json(res, { name: agent.name, llm: effectiveAgentLlm(cfg, co.meta, agent), agent });
    } catch (e) {
      json(res, { error: (e as Error).message }, 404);
    }
    return true;
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
            return true;
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
      json(res, { ok: true, name: agent.name, llm: effectiveAgentLlm(cfg, co.meta, agent), agent });
    } catch (e) {
      json(res, { error: (e as Error).message }, 400);
    }
    return true;
  }

  // ---- governance & perpetuity ----

  if (req.method === "POST" && url.pathname === "/api/company/delete") {
    const body = await readBody(req);
    const slug = slugify(String(body.company ?? body.slug ?? ""));
    if (!slug) {
      json(res, { error: "company slug required" }, 400);
      return true;
    }
    const r = runners.get(slug);
    if (r?.mode) {
      r.stopRequested = true;
      json(res, { error: `company is ${r.mode}ing — stop it first, then delete` }, 409);
      return true;
    }
    runners.delete(slug);
    Company.delete(root, slug);
    json(res, { ok: true });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/company/export") {
    const slug = slugify(url.searchParams.get("company") ?? "");
    const modeRaw = (url.searchParams.get("mode") ?? "layout").toLowerCase();
    const mode: CompanyExportMode = modeRaw === "full" ? "full" : "layout";
    if (!slug) {
      json(res, { error: "company slug required" }, 400);
      return true;
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
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/company/pause") {
    const body = await readBody(req);
    const co = Company.open(root, String(body.company ?? ""));
    const paused = !!body.paused;
    co.saveMeta({ paused });
    co.audit({ type: paused ? "company.paused" : "company.resumed", ok: true, detail: "by owner (ui)" });
    json(res, { ok: true, paused });
    return true;
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
    return true;
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
    return true;
  }

  return false;
};
