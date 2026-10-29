import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { Company } from "../core/store.js";
import { agentForToken, WORK_ACTIONS, workCall, type WorkAction } from "../core/work-api.js";

/** Remote access for external agents that cannot run the CLI locally —
 * cloud agents, claude.ai / Claude Desktop connectors, bots on other hosts.
 * A separate, minimal server: it exposes ONLY the work contract, never the
 * dashboard or operator actions, and every request needs the agent's token
 * (profile `tokenEnv:` → env var). Put a TLS tunnel or reverse proxy in front
 * to reach it from outside; it binds to 127.0.0.1 by default.
 *
 *   POST /api/work/<slug>/<action>    JSON body → JSON reply (see docs/AGENT-CONTRACT.md)
 *   POST /mcp/<slug>                  MCP Streamable HTTP (stateless), tools work_*
 *   POST /mcp/<slug>/t/<token>        same, token in the URL for clients without custom headers
 *   GET  /health
 */

const MAX_BODY = 1_000_000;
const PER_AGENT_PER_MIN = 120;
const BAD_AUTH_PER_IP_PER_MIN = 20;

/** Sliding one-minute windows: requests per agent, failed logins per IP. */
class RateLimit {
  private hits = new Map<string, number[]>();
  constructor(private perMinute: number) {}
  /** Count a hit; false when over the limit. */
  take(key: string): boolean {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < 60_000);
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.hits.clear(); // crude memory cap
    return recent.length <= this.perMinute;
  }
  over(key: string): boolean {
    const now = Date.now();
    return (this.hits.get(key) ?? []).filter((t) => now - t < 60_000).length >= this.perMinute;
  }
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.setEncoding("utf8");
    req.on("data", (d: string) => {
      buf += d;
      if (buf.length > MAX_BODY) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(buf ? (JSON.parse(buf) as Record<string, unknown>) : {});
      } catch {
        reject(new Error("body is not JSON"));
      }
    });
    req.on("error", reject);
  });
}

function bearer(req: http.IncomingMessage): string {
  const h = req.headers.authorization ?? "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

/** Behind a tunnel/reverse proxy every request comes from the proxy, so the
 * failed-login limit must key on the forwarded client address instead. */
function clientIp(req: http.IncomingMessage, trustProxy: boolean): string {
  const fwd = trustProxy ? String(req.headers["x-forwarded-for"] ?? "").split(",")[0]!.trim() : "";
  return fwd || req.socket.remoteAddress || "?";
}

/** MCP server bound to one authenticated agent — identity comes from the
 * token, so the tools take no agent name. */
function agentMcp(co: Company, agent: string): McpServer {
  const server = new McpServer({ name: `ai-company-os/${agent}`, version: "0.1.0" });
  const reply = async (action: WorkAction, p: Record<string, unknown>) => {
    const r = await workCall(co, agent, action, p);
    return { content: [{ type: "text" as const, text: JSON.stringify(r.body, null, 2) }], isError: r.status >= 400 };
  };
  const taskId = z.string().describe("Task id, e.g. TASK-0042");
  const lease = z.string().describe("Lease id from work_next");

  server.registerTool(
    "work_next",
    {
      title: "Claim next task",
      description: `Claim your next task as ${agent} (or resume the one you hold). Returns task, lease and the full brief; { idle: true } when there is nothing to do.`,
      inputSchema: { wait_seconds: z.number().int().min(0).max(60).optional() },
    },
    async ({ wait_seconds }) => reply("next", { wait: wait_seconds ?? 0 })
  );
  server.registerTool(
    "work_brief",
    { title: "Task brief", description: "The assignment text for a task you hold.", inputSchema: { task_id: taskId, lease } },
    async ({ task_id, lease: l }) => reply("brief", { taskId: task_id, lease: l })
  );
  server.registerTool(
    "work_heartbeat",
    { title: "Keep task", description: "Extend your lease while you keep working.", inputSchema: { task_id: taskId, lease } },
    async ({ task_id, lease: l }) => reply("heartbeat", { taskId: task_id, lease: l })
  );
  server.registerTool(
    "work_done",
    {
      title: "Report result",
      description: "Finish a task you hold with an honest result.",
      inputSchema: { task_id: taskId, lease, result: z.string().min(1), tokens: z.number().int().min(0).optional() },
    },
    async ({ task_id, lease: l, result, tokens }) => reply("done", { taskId: task_id, lease: l, result, tokens })
  );
  server.registerTool(
    "work_fail",
    {
      title: "Report failure",
      description: "Report that you could not do the task (counts an attempt unless retry=false).",
      inputSchema: { task_id: taskId, lease, reason: z.string().min(1), retry: z.boolean().optional() },
    },
    async ({ task_id, lease: l, reason, retry }) => reply("fail", { taskId: task_id, lease: l, reason, retry })
  );
  server.registerTool(
    "work_delegate",
    {
      title: "Delegate",
      description: "Split a task you hold into subtasks for your direct reports.",
      inputSchema: {
        task_id: taskId,
        lease,
        subtasks: z.array(z.object({ title: z.string(), description: z.string(), assignee: z.string() })).min(1).max(6),
      },
    },
    async ({ task_id, lease: l, subtasks }) => reply("delegate", { taskId: task_id, lease: l, subtasks })
  );
  server.registerTool(
    "work_release",
    {
      title: "Release task",
      description: "Hand a task back unfinished without counting an attempt.",
      inputSchema: { task_id: taskId, lease, reason: z.string().optional() },
    },
    async ({ task_id, lease: l, reason }) => reply("release", { taskId: task_id, lease: l, reason })
  );
  server.registerTool(
    "work_message",
    {
      title: "Message an agent",
      description: "Drop a note into another agent's inbox.",
      inputSchema: { to: z.string(), text: z.string().min(1), task_id: z.string().optional() },
    },
    async ({ to, text, task_id }) => reply("message", { to, text, taskId: task_id })
  );
  server.registerTool(
    "work_inbox",
    { title: "Unread messages", description: "Your unread inbox messages.", inputSchema: {} },
    async () => reply("inbox", {})
  );
  return server;
}

export function serveAgents(root: string, opts: { port: number; host: string; trustProxy?: boolean; log?: (l: string) => void }): http.Server {
  const log = opts.log ?? (() => {});
  const perAgent = new RateLimit(PER_AGENT_PER_MIN);
  const badAuth = new RateLimit(BAD_AUTH_PER_IP_PER_MIN);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const parts = url.pathname.split("/").filter(Boolean);
    try {
      if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true });

      const kind = parts[0] === "api" && parts[1] === "work" ? "api" : parts[0] === "mcp" ? "mcp" : null;
      if (!kind) return send(res, 404, { ok: false, error: "not found" });
      const slug = kind === "api" ? parts[2] : parts[1];
      const pathToken = kind === "mcp" && parts[2] === "t" ? (parts[3] ?? "") : "";
      if (!slug || !/^[\w-]+$/.test(slug)) return send(res, 404, { ok: false, error: "unknown company" });

      const ip = clientIp(req, !!opts.trustProxy);
      if (badAuth.over(ip)) return send(res, 429, { ok: false, error: "too many failed logins — wait a minute" });
      let co: Company;
      try {
        co = Company.open(root, slug);
      } catch {
        badAuth.take(ip);
        return send(res, 401, { ok: false, error: "unauthorized" }); // do not reveal which companies exist
      }
      const agent = agentForToken(co, bearer(req) || pathToken);
      if (!agent) {
        badAuth.take(ip);
        log(`✗ auth failed ${ip} ${req.method} ${url.pathname.replace(/\/t\/[^/]+/, "/t/***")}`);
        return send(res, 401, { ok: false, error: "unauthorized" });
      }
      if (!perAgent.take(`${slug}/${agent.name}`)) return send(res, 429, { ok: false, error: "rate limit — slow down" });

      if (kind === "api") {
        const action = parts[3] as WorkAction;
        if (!WORK_ACTIONS.includes(action)) return send(res, 404, { ok: false, error: `unknown action; use one of ${WORK_ACTIONS.join(", ")}` });
        if (req.method !== "POST" && !(req.method === "GET" && action === "inbox")) {
          return send(res, 405, { ok: false, error: "use POST" });
        }
        const body = req.method === "POST" ? await readJson(req) : {};
        const r = await workCall(co, agent.name, action, body);
        log(`${r.status} ${agent.name} ${action}${typeof body.taskId === "string" ? ` ${body.taskId}` : ""}`);
        return send(res, r.status, r.body);
      }

      // MCP Streamable HTTP, stateless: a fresh server + transport per request
      if (req.method !== "POST") {
        res.writeHead(405, { allow: "POST" }).end();
        return;
      }
      const body = await readJson(req);
      const mcp = agentMcp(co, agent.name);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => {
        void transport.close();
        void mcp.close();
      });
      await mcp.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (e) {
      if (!res.headersSent) send(res, 400, { ok: false, error: (e as Error).message });
      else res.end();
    }
  });
  server.listen(opts.port, opts.host, () => log(`agent API on http://${opts.host}:${opts.port} (work contract only, token required)`));
  return server;
}
