import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatCliResult, runCli } from "./run.js";

const companyOpt = z
  .string()
  .optional()
  .describe("Company slug (-c); required when several companies exist");

async function cli(argv: string[], cwd?: string, timeoutMs?: number) {
  const result = await runCli({ argv, cwd, timeoutMs });
  const formatted = formatCliResult(result);
  return {
    content: [{ type: "text" as const, text: formatted.text }],
    isError: formatted.isError,
  };
}

function withCompany(argv: string[], company?: string): string[] {
  if (!company) return argv;
  return [...argv, "-c", company];
}

/** Higher-level tools that map common dashboard actions to CLI argv. */
export function registerCuratedTools(server: McpServer): void {
  server.registerTool(
    "companies",
    {
      title: "List companies",
      description: "List companies in the workspace (Home view).",
      inputSchema: { cwd: z.string().optional() },
    },
    async ({ cwd }) => cli(["companies"], cwd)
  );

  server.registerTool(
    "status",
    {
      title: "Company status",
      description: "Org chart summary, queue, and budget for a company.",
      inputSchema: { company: companyOpt, cwd: z.string().optional() },
    },
    async ({ company, cwd }) => cli(withCompany(["status"], company), cwd)
  );

  server.registerTool(
    "show_state",
    {
      title: "Full company snapshot",
      description:
        "Full JSON snapshot: meta, agents, tasks, queue, audit, chat, approvals, connectors. Prefer this before acting.",
      inputSchema: { company: companyOpt, cwd: z.string().optional() },
    },
    async ({ company, cwd }) => cli(withCompany(["show", "state"], company), cwd)
  );

  server.registerTool(
    "queue",
    {
      title: "List tasks",
      description: "List all tasks and the queue order.",
      inputSchema: { company: companyOpt, cwd: z.string().optional() },
    },
    async ({ company, cwd }) => cli(withCompany(["queue"], company), cwd)
  );

  server.registerTool(
    "chat",
    {
      title: "Chat with chief",
      description: "Send a message to the company chief (persists chat history).",
      inputSchema: {
        message: z.string().min(1).describe("Message text"),
        company: companyOpt,
        cwd: z.string().optional(),
        timeout_ms: z.number().int().positive().optional(),
      },
    },
    async ({ message, company, cwd, timeout_ms }) =>
      cli(withCompany(["chat", message], company), cwd, timeout_ms)
  );

  server.registerTool(
    "tick",
    {
      title: "Run one tick",
      description: "Process one parallel wave of ready tasks.",
      inputSchema: {
        company: companyOpt,
        steps: z.number().int().positive().optional().describe("Max agent steps per task"),
        cwd: z.string().optional(),
        timeout_ms: z.number().int().positive().optional(),
      },
    },
    async ({ company, steps, cwd, timeout_ms }) => {
      const argv = withCompany(["tick"], company);
      if (steps) argv.push("--steps", String(steps));
      return cli(argv, cwd, timeout_ms);
    }
  );

  server.registerTool(
    "run",
    {
      title: "Run until idle",
      description: "Run ticks until the queue is empty or budget/tick caps hit.",
      inputSchema: {
        company: companyOpt,
        ticks: z.number().int().positive().optional().describe("Max ticks"),
        steps: z.number().int().positive().optional(),
        cwd: z.string().optional(),
        timeout_ms: z.number().int().positive().optional(),
      },
    },
    async ({ company, ticks, steps, cwd, timeout_ms }) => {
      const argv = withCompany(["run"], company);
      if (ticks) argv.push("-t", String(ticks));
      if (steps) argv.push("--steps", String(steps));
      return cli(argv, cwd, timeout_ms ?? 30 * 60_000);
    }
  );

  server.registerTool(
    "approvals",
    {
      title: "List approvals",
      description: "List pending tool-approval requests.",
      inputSchema: { company: companyOpt, cwd: z.string().optional() },
    },
    async ({ company, cwd }) => cli(withCompany(["approvals"], company), cwd)
  );

  server.registerTool(
    "approve",
    {
      title: "Approve request",
      description: "Approve a pending approval id (re-queues the task).",
      inputSchema: {
        id: z.string().describe("Approval id"),
        note: z.string().optional(),
        company: companyOpt,
        cwd: z.string().optional(),
      },
    },
    async ({ id, note, company, cwd }) => {
      const argv = withCompany(["approve", id], company);
      if (note) argv.push("-n", note);
      return cli(argv, cwd);
    }
  );

  server.registerTool(
    "deny",
    {
      title: "Deny request",
      description: "Deny a pending approval id.",
      inputSchema: {
        id: z.string().describe("Approval id"),
        note: z.string().optional(),
        company: companyOpt,
        cwd: z.string().optional(),
      },
    },
    async ({ id, note, company, cwd }) => {
      const argv = withCompany(["deny", id], company);
      if (note) argv.push("-n", note);
      return cli(argv, cwd);
    }
  );

  server.registerTool(
    "pause",
    {
      title: "Pause company",
      description: "Pause a company (no ticks until resumed).",
      inputSchema: { company: companyOpt, cwd: z.string().optional() },
    },
    async ({ company, cwd }) => cli(withCompany(["pause"], company), cwd)
  );

  server.registerTool(
    "resume",
    {
      title: "Resume company",
      description: "Resume a paused company.",
      inputSchema: { company: companyOpt, cwd: z.string().optional() },
    },
    async ({ company, cwd }) => cli(withCompany(["resume"], company), cwd)
  );

  server.registerTool(
    "budget",
    {
      title: "Budget show/grant",
      description: "Show token budget, or grant more with add_tokens.",
      inputSchema: {
        company: companyOpt,
        add_tokens: z.number().int().positive().optional().describe("Tokens to grant"),
        cwd: z.string().optional(),
      },
    },
    async ({ company, add_tokens, cwd }) => {
      const argv = withCompany(["budget"], company);
      if (add_tokens) argv.push("--add", String(add_tokens));
      return cli(argv, cwd);
    }
  );

  server.registerTool(
    "db_list",
    {
      title: "List databases",
      description: "List SQLite databases and tables under company data/.",
      inputSchema: { company: companyOpt, cwd: z.string().optional() },
    },
    async ({ company, cwd }) => cli(withCompany(["db", "list"], company), cwd)
  );

  server.registerTool(
    "db_query",
    {
      title: "Query database",
      description: "Run a read-only SELECT/PRAGMA/WITH against a company SQLite file.",
      inputSchema: {
        db: z.string().describe("Database filename under data/"),
        sql: z.string().describe("Read-only SQL"),
        company: companyOpt,
        cwd: z.string().optional(),
      },
    },
    async ({ db, sql, company, cwd }) => cli(withCompany(["db", "query", db, sql], company), cwd)
  );

  server.registerTool(
    "connectors_get",
    {
      title: "Get connectors",
      description: "Show connector config and poll state for a company.",
      inputSchema: { company: companyOpt, cwd: z.string().optional() },
    },
    async ({ company, cwd }) => cli(withCompany(["connectors", "get"], company), cwd)
  );

  server.registerTool(
    "skills_list",
    {
      title: "List skills",
      description: "List bundled and workspace skills.",
      inputSchema: { cwd: z.string().optional() },
    },
    async ({ cwd }) => cli(["skills", "list"], cwd)
  );

  server.registerTool(
    "config_get",
    {
      title: "Get config",
      description: "Show effective providers, roles, models, and skills.",
      inputSchema: { cwd: z.string().optional() },
    },
    async ({ cwd }) => cli(["config", "get"], cwd)
  );

  server.registerTool(
    "plans_list",
    {
      title: "List plans",
      description: "List draft plans in plans/.",
      inputSchema: { cwd: z.string().optional() },
    },
    async ({ cwd }) => cli(["plans", "list"], cwd)
  );

  server.registerTool(
    "show_org",
    {
      title: "Show org + LLM sources",
      description:
        "Organization chart with each agent's effective LLM provider/model (e.g. chief→claude, worker→openrouter).",
      inputSchema: { company: companyOpt, cwd: z.string().optional() },
    },
    async ({ company, cwd }) => cli(withCompany(["show", "org"], company), cwd)
  );

  server.registerTool(
    "agent_llm",
    {
      title: "Get agent LLM",
      description: "Show an agent's effective LLM source and any profile override.",
      inputSchema: {
        name: z.string().describe("Agent name"),
        company: companyOpt,
        cwd: z.string().optional(),
      },
    },
    async ({ name, company, cwd }) => cli(withCompany(["agent", name], company), cwd)
  );

  server.registerTool(
    "set_agent_llm",
    {
      title: "Set agent LLM source",
      description:
        "Pin an agent to a provider/model (e.g. provider=claude model=sonnet), or clear to inherit company/workspace default. " +
        "Use different sources per agent: chief=claude, developer=cursor, researcher=openrouter.",
      inputSchema: {
        name: z.string().describe("Agent name"),
        provider: z
          .string()
          .optional()
          .describe("Provider name from ai-company-os.json (claude, cursor, openrouter, …)"),
        model: z.string().optional().describe("Model id/alias for that provider"),
        clear: z.boolean().optional().describe("If true, remove override and inherit defaults"),
        company: companyOpt,
        cwd: z.string().optional(),
      },
    },
    async ({ name, provider, model, clear, company, cwd }) => {
      const argv = withCompany(["set-llm", name], company);
      if (clear) argv.push("--clear");
      else {
        if (provider) argv.push("-p", provider);
        if (model) argv.push("-m", model);
      }
      return cli(argv, cwd);
    }
  );

  server.registerTool(
    "config_set",
    {
      title: "Set workspace roles/models",
      description: "Set workspace role→provider and/or role→model defaults (planning/agents/execution).",
      inputSchema: {
        roles: z
          .array(z.string())
          .optional()
          .describe('role=provider pairs, e.g. ["planning=ollama-local","agents=cursor"]'),
        models: z
          .array(z.string())
          .optional()
          .describe('role=model pairs, e.g. ["agents=auto","planning=gemma4:12b"]'),
        cwd: z.string().optional(),
      },
    },
    async ({ roles, models, cwd }) => {
      const argv = ["config", "set"];
      for (const r of roles ?? []) argv.push("--role", r);
      for (const m of models ?? []) argv.push("--model", m);
      return cli(argv, cwd);
    }
  );
}
