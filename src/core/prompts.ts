import fs from "node:fs";
import path from "node:path";
import type { AgentSpec, Task } from "../types.js";
import { truncate } from "../util.js";
import type { Company } from "./store.js";
import type { Tool } from "./tools.js";

/** Flat action schema. Small models handle one flat object with optional
 * slots far better than nested discriminated unions, and every arg a tool can
 * take is an explicit string property so grammar-constrained decoding works
 * on Ollama and OpenRouter alike. */
export const ACTION_SCHEMA = {
  type: "object",
  properties: {
    thought: { type: "string" },
    action: { type: "string", enum: ["tool", "delegate", "message", "complete"] },
    tool: { type: "string" },
    args: {
      type: "object",
      properties: {
        op: { type: "string" },
        path: { type: "string" },
        content: { type: "string" },
        url: { type: "string" },
        db: { type: "string" },
        sql: { type: "string" },
        query: { type: "string" },
        queries: { type: "array", items: { type: "string" } },
        cities: { type: "array", items: { type: "string" } },
        trades: { type: "array", items: { type: "string" } },
        into: { type: "string" },
        segment: { type: "string" },
        country: { type: "string" },
        overpassQl: { type: "string" },
      },
      additionalProperties: false,
    },
    subtasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          assignee: { type: "string" },
        },
        required: ["title", "description", "assignee"],
        additionalProperties: false,
      },
    },
    to: { type: "string" },
    content: { type: "string" },
    result: { type: "string" },
  },
  required: ["thought", "action"],
} as const;

function listSkillExtras(skillDir: string): string[] {
  const extras: string[] = [];
  const walk = (abs: string, rel: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "__MACOSX") continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(abs, e.name), childRel);
      else if (e.isFile() && e.name !== "SKILL.md") extras.push(childRel);
    }
  };
  walk(skillDir, "");
  return extras.sort();
}

function loadSkills(co: Company, names: string[]): string {
  const parts: string[] = [];
  for (const name of names) {
    const skillDir = path.join(co.dir, "skills", name);
    const file = path.join(skillDir, "SKILL.md");
    if (!fs.existsSync(file)) continue;
    const body = truncate(fs.readFileSync(file, "utf8"), 1500);
    const extras = listSkillExtras(skillDir);
    const pack =
      extras.length > 0
        ? `\n\nPackaged files under \`skills/${name}/\` (use filesystem/shell to read or run):\n` +
          extras.map((p) => `- skills/${name}/${p}`).join("\n")
        : "";
    parts.push(`### Skill: ${name}\n` + body + pack);
  }
  return parts.join("\n\n");
}

export function systemPrompt(co: Company, agent: AgentSpec, tools: Tool[]): string {
  const meta = co.meta;
  const reports = co.directReports(agent.name).map((a) => `${a.name} (${a.role})`);
  const canDelegate = reports.length > 0;

  const lines: string[] = [
    `You are ${agent.name}, ${agent.role} at "${meta.name}". Rank: ${agent.rank}.`,
    agent.manager ? `Your manager: ${agent.manager}.` : `You report directly to the user.`,
    reports.length ? `Your direct reports: ${reports.join(", ")}.` : "",
    ``,
    `Company goal: ${meta.goal}`,
    ``,
    `## Your responsibilities`,
    ...agent.responsibilities.map((r) => `- ${r}`),
  ];

  const skills = loadSkills(co, agent.skills);
  if (skills) lines.push("", "## Skills", skills);

  if (tools.length) {
    lines.push("", "## Tools", ...tools.map((t) => `- ${t.doc}`));
  }

  lines.push(
    "",
    "## How you work",
    "You handle one task at a time, in steps. Every step you answer with EXACTLY ONE JSON object, nothing else.",
    "Possible actions:"
  );
  if (tools.length) {
    lines.push(
      `- Use a tool: {"thought": "why", "action": "tool", "tool": "sqlite", "args": {"sql": "SELECT 1"}}`
    );
  }
  if (canDelegate) {
    lines.push(
      `- Split the task and hand pieces to your reports: {"thought": "why", "action": "delegate", "subtasks": [{"title": "short title", "description": "precise instructions", "assignee": "ReportName"}]}`
    );
  }
  lines.push(
    `- Message another agent: {"thought": "why", "action": "message", "to": "AgentName", "content": "..."}`,
    `- Finish and report: {"thought": "why", "action": "complete", "result": "concise factual summary of what was done, with file/db paths of anything you produced"}`,
    "",
    "## Rules"
  );
  if (canDelegate) {
    lines.push(
      "- Break the task into 2-5 concrete subtasks and delegate them to the right reports. Each description must be self-contained.",
      "- When the task shows results from finished subtasks, do NOT delegate again: synthesize them and complete.",
      "- Only assign subtasks to your direct reports listed above."
    );
  } else {
    lines.push(
      "- You cannot delegate. Do the work yourself with your tools, then complete.",
      "- Store durable output under data/ (shared) and notes under agents/" +
        agent.name +
        "/workspace/."
    );
  }
  lines.push(
    "- Keep every JSON field short. No markdown fences. No text outside the JSON object.",
    "- If a tool errors, adjust and try a different step. After real progress, complete with an honest result."
  );

  return lines.filter((l) => l !== undefined).join("\n");
}

export function stepPrompt(
  co: Company,
  task: Task,
  inbox: { from: string; subject: string; content: string }[],
  transcript: string[]
): string {
  const parts: string[] = [
    `# Current task ${task.id}: ${task.title}`,
    task.description,
  ];

  // numeric target: show the LIVE count so the agent adds toward the number
  // instead of restarting and stopping at whatever fits in one tick
  if (task.target) {
    const have = co.measure(task.target);
    parts.push(
      "",
      `## Progress toward target: ${have} / ${task.target.count} rows in table "${task.target.table}"` +
        (task.target.where ? ` where ${task.target.where}` : ""),
      `You need ${Math.max(0, task.target.count - have)} MORE. The ${have} existing rows are already saved —` +
        ` do NOT recreate the table, do NOT re-insert them, ADD new distinct rows.` +
        ` FASTEST WAY: if you have the "discover" tool, call it repeatedly with just` +
        ` {trades:[...], into:"${task.target.table}"} and NO cities — it auto-sweeps ~260 DACH cities,` +
        ` skipping ones already in the table, so each call adds a fresh batch (~100-500 rows). Keep calling` +
        ` it every step. Only 'complete' when discover reports the region is exhausted / no new rows — the` +
        ` engine re-checks the count and continues you if you stopped short.`
    );
  }

  // retry: show why the last attempt failed + its final notes, so this
  // attempt starts smarter instead of repeating the same dead end
  if ((task.attempts ?? 0) > 0 && transcript.length === 0) {
    parts.push(
      "",
      `## This is attempt ${(task.attempts ?? 0) + 1} — your previous attempt FAILED`,
      task.result?.startsWith("FAILED") ? task.result : "(no failure reason recorded)"
    );
    const thoughtsFile = path.join(co.agentDir(task.assignee), "workspace", `${task.id}.md`);
    if (fs.existsSync(thoughtsFile)) {
      const tail = fs.readFileSync(thoughtsFile, "utf8").slice(-1500);
      parts.push("", "### End of your previous attempt's notes", tail, "", "Do NOT repeat the same approach that failed. Change strategy.");
    }
  }

  const children = co.children(task.id);
  const done = children.filter((t) => t.status === "done" || t.status === "failed");
  if (done.length) {
    parts.push(
      "",
      "## Results from your subtasks",
      ...done.map(
        (t) =>
          `- ${t.id} "${t.title}" (${t.assignee}, ${t.status}): ${truncate(t.result ?? "(no result)", 700)}`
      )
    );
  }

  if (inbox.length) {
    parts.push(
      "",
      "## New messages in your inbox",
      ...inbox.map((m) => `- from ${m.from} — ${m.subject}: ${truncate(m.content, 500)}`)
    );
  }

  if (transcript.length) {
    // keep BOTH ends: early steps hold research results (URLs, query output)
    // the model must copy from later; recent steps hold the current context
    let text = transcript.join("\n");
    if (text.length > 12_000) {
      text =
        text.slice(0, 6000) +
        "\n… [middle steps omitted — your earliest results above remain valid] …\n" +
        text.slice(-6000);
    }
    parts.push("", "## Your previous steps on this task", text);
  }

  parts.push("", "What is your next step? Answer with one JSON action object.");
  return parts.join("\n");
}
