import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatCliResult, runCli } from "./run.js";

/** The external-agent contract (`work …`) as MCP tools, so any MCP host —
 * Claude Code, Claude Desktop, Cursor, Codex — can work tasks as an org-chart
 * agent. Identity defaults to $AI_COMPANY_OS_AGENT of this server instance,
 * so one MCP entry per agent pins who the host is. See docs/AGENT-CONTRACT.md. */

const IDLE_EXIT = 3;

const company = z.string().optional().describe("Company slug (-c); required when several companies exist");
const taskId = z.string().describe("Task id, e.g. TASK-0042");
const lease = z.string().describe("Lease id returned by work_next");
const cwd = z.string().optional();

async function work(argv: string[], dir?: string, slug?: string, timeoutMs?: number) {
  const full = ["work", ...argv, ...(slug ? ["-c", slug] : [])];
  const result = await runCli({ argv: full, cwd: dir, timeoutMs });
  const formatted = formatCliResult(result);
  // "nothing to do" is a normal answer, not a tool error
  const idle = result.code === IDLE_EXIT;
  return {
    content: [{ type: "text" as const, text: formatted.text }],
    isError: formatted.isError && !idle,
  };
}

function as(agent?: string): string[] {
  const name = agent || process.env.AI_COMPANY_OS_AGENT;
  return name ? ["--as", name] : [];
}

export function registerWorkTools(server: McpServer): void {
  server.registerTool(
    "work_next",
    {
      title: "Claim next task",
      description:
        "Claim your next ready task as an org-chart agent (or resume the one you hold). Returns the task, a lease id and the full brief. Nothing to do → { idle: true }.",
      inputSchema: {
        agent: z.string().optional().describe("Your agent name (default $AI_COMPANY_OS_AGENT)"),
        wait_seconds: z.number().int().min(0).max(600).optional().describe("Wait up to N seconds for work"),
        company,
        cwd,
      },
    },
    async ({ agent, wait_seconds, company: slug, cwd: dir }) =>
      work(["next", ...as(agent), "--wait", String(wait_seconds ?? 0)], dir, slug, ((wait_seconds ?? 0) + 60) * 1000)
  );

  server.registerTool(
    "work_brief",
    {
      title: "Task brief",
      description: "The assignment text for a task you hold: context, goal chain, inbox, subtask results, how to report.",
      inputSchema: { task_id: taskId, lease, company, cwd },
    },
    async ({ task_id, lease: l, company: slug, cwd: dir }) => work(["brief", task_id, "--lease", l], dir, slug)
  );

  server.registerTool(
    "work_heartbeat",
    {
      title: "Keep task",
      description: "Extend your lease while you keep working, so the task does not return to the queue.",
      inputSchema: { task_id: taskId, lease, company, cwd },
    },
    async ({ task_id, lease: l, company: slug, cwd: dir }) => work(["heartbeat", task_id, "--lease", l], dir, slug)
  );

  server.registerTool(
    "work_done",
    {
      title: "Report result",
      description: "Finish a task you hold with a result (paths of everything you produced). May go to owner review first.",
      inputSchema: {
        task_id: taskId,
        lease,
        result: z.string().min(1),
        tokens: z.number().int().min(0).optional().describe("Tokens you spent, if known"),
        company,
        cwd,
      },
    },
    async ({ task_id, lease: l, result, tokens, company: slug, cwd: dir }) =>
      work(["done", task_id, "--lease", l, "--result", result, ...(tokens ? ["--tokens", String(tokens)] : [])], dir, slug)
  );

  server.registerTool(
    "work_fail",
    {
      title: "Report failure",
      description: "Report that you could not do the task. Counts an attempt (retry) unless retry=false.",
      inputSchema: { task_id: taskId, lease, reason: z.string().min(1), retry: z.boolean().optional(), company, cwd },
    },
    async ({ task_id, lease: l, reason, retry, company: slug, cwd: dir }) =>
      work(["fail", task_id, "--lease", l, "--reason", reason, ...(retry === false ? ["--no-retry"] : [])], dir, slug)
  );

  server.registerTool(
    "work_delegate",
    {
      title: "Delegate",
      description: "Split a task you hold into subtasks for your direct reports; you get it back with their results.",
      inputSchema: {
        task_id: taskId,
        lease,
        subtasks: z
          .array(z.object({ title: z.string(), description: z.string(), assignee: z.string() }))
          .min(1)
          .max(6),
        company,
        cwd,
      },
    },
    async ({ task_id, lease: l, subtasks, company: slug, cwd: dir }) =>
      work(["delegate", task_id, "--lease", l, "--subtasks", JSON.stringify(subtasks)], dir, slug)
  );

  server.registerTool(
    "work_message",
    {
      title: "Message an agent",
      description: "Drop a note into another agent's inbox.",
      inputSchema: {
        to: z.string(),
        text: z.string().min(1),
        task_id: z.string().optional(),
        agent: z.string().optional().describe("Your agent name (default $AI_COMPANY_OS_AGENT)"),
        company,
        cwd,
      },
    },
    async ({ to, text, task_id, agent, company: slug, cwd: dir }) =>
      work(["message", ...as(agent), "--to", to, "--text", text, ...(task_id ? ["--task", task_id] : [])], dir, slug)
  );

  server.registerTool(
    "work_release",
    {
      title: "Release task",
      description: "Hand a task back unfinished without counting an attempt.",
      inputSchema: { task_id: taskId, lease, reason: z.string().optional(), company, cwd },
    },
    async ({ task_id, lease: l, reason, company: slug, cwd: dir }) =>
      work(["release", task_id, "--lease", l, ...(reason ? ["--reason", reason] : [])], dir, slug)
  );

  server.registerTool(
    "work_inbox",
    {
      title: "Unread messages",
      description: "Your unread inbox messages (not marked read).",
      inputSchema: { agent: z.string().optional(), company, cwd },
    },
    async ({ agent, company: slug, cwd: dir }) => work(["inbox", ...as(agent)], dir, slug)
  );

  server.registerTool(
    "set_agent_runtime",
    {
      title: "Set agent runtime",
      description:
        "Operator: make an agent internal, external (pull, or push with an adapter like codex / claude-code / cursor) or manual.",
      inputSchema: {
        name: z.string().describe("Agent name"),
        runtime: z.enum(["internal", "external", "manual"]),
        adapter: z.string().optional().describe("Push launcher from agentRuntimes; omit for pull"),
        max_minutes_per_task: z.number().int().positive().optional(),
        max_tasks_per_day: z.number().int().positive().optional(),
        approve_results: z.boolean().optional(),
        company,
        cwd,
      },
    },
    async ({ name, runtime, adapter, max_minutes_per_task, max_tasks_per_day, approve_results, company: slug, cwd: dir }) => {
      const argv = ["set-runtime", name, "--runtime", runtime, "--adapter", adapter ?? ""];
      if (max_minutes_per_task) argv.push("--max-minutes-per-task", String(max_minutes_per_task));
      if (max_tasks_per_day) argv.push("--max-tasks-per-day", String(max_tasks_per_day));
      if (approve_results !== undefined) argv.push("--approve-results", String(approve_results));
      if (slug) argv.push("-c", slug);
      const result = await runCli({ argv, cwd: dir });
      const formatted = formatCliResult(result);
      return { content: [{ type: "text" as const, text: formatted.text }], isError: formatted.isError };
    }
  );
}
