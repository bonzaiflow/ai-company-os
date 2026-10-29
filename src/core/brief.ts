import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentSpec, Task, TaskLease } from "../types.js";
import { truncate } from "../util.js";
import { leaseMinutesFor } from "./agent-runtime.js";
import { claimInboxFile } from "./lease.js";
import { loadSkills } from "./prompts.js";
import type { Company } from "./store.js";

/** The one assignment text every external agent gets — pasted into a chat
 * (manual), passed as the prompt of a push run, or fetched with `work brief`
 * (pull). Self-contained: who you are, why the task exists, what to do, and
 * the exact commands to report back. Agent-agnostic on purpose: nothing in
 * here assumes a particular model or host. */

const CLI_JS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "cli.js");

export function workspaceRootOf(co: Company): string {
  return path.resolve(co.dir, "..", "..");
}

/** Shell prefix that works from any cwd, with or without `npm link`. */
export function cliPrefix(co: Company): string {
  const bin = process.env.AI_COMPANY_OS_BIN || `node ${q(CLI_JS)}`;
  return `AI_COMPANY_OS_ROOT=${q(workspaceRootOf(co))} ${bin} --json`;
}

function q(s: string): string {
  return /^[\w./@:-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Root-first chain of ancestor tasks — why this task exists. */
function goalChain(co: Company, task: Task): Task[] {
  const chain: Task[] = [];
  let cur = task;
  while (cur.parent && chain.length < 10) {
    try {
      cur = co.loadTask(cur.parent);
    } catch {
      break;
    }
    chain.unshift(cur);
  }
  return chain;
}

/** cli: report with `work …` commands (pull, manual). reply: finish with a
 * JSON object in the final answer, which the push adapter parses — the agent
 * needs no shell access to the company at all. */
export type BriefMode = "cli" | "reply";

export function renderBrief(
  co: Company,
  task: Task,
  agent: AgentSpec,
  lease: TaskLease,
  mode: BriefMode = "cli"
): string {
  const meta = co.meta;
  const reports = co.directReports(agent.name);
  const slug = path.basename(co.dir);
  const cli = `${cliPrefix(co)} work`;
  const ids = `${task.id} -c ${slug} --lease ${lease.id}`;
  const beatEvery = Math.max(1, Math.floor(leaseMinutesFor(agent) / 3));

  const parts: string[] = [
    `# Assignment ${task.id}: ${task.title}`,
    "",
    `You are **${agent.name}**, ${agent.role} at "${meta.name}" (rank: ${agent.rank}).`,
    agent.manager ? `You report to ${agent.manager}.` : "You report directly to the owner.",
    reports.length ? `Your direct reports: ${reports.map((r) => `${r.name} (${r.role})`).join(", ")}.` : "",
    "",
    `**Company goal:** ${meta.goal}`,
  ];

  const chain = goalChain(co, task);
  if (chain.length) {
    parts.push("", "## Why this task exists", ...chain.map((t, i) => `${"  ".repeat(i)}- ${t.id} ${t.title} (${t.assignee})`));
  }

  parts.push("", "## Your task", task.description || task.title);

  if (task.target) {
    const have = co.measure(task.target);
    parts.push(
      "",
      `**Target:** ${task.target.count} rows in table \`${task.target.table}\`` +
        `${task.target.where ? ` where ${task.target.where}` : ""} of data/${task.target.db ?? "main.db"} — currently ${have}. ` +
        "Add new distinct rows; the task is only done when the count is reached."
    );
  }

  if (task.result && /^(FAILED|REVIEW DENIED|IN PROGRESS)/.test(task.result)) {
    parts.push("", "## Previous attempt", truncate(task.result, 2000));
  }

  const children = co.children(task.id).filter((t) => t.status === "done" || t.status === "failed");
  if (children.length) {
    parts.push(
      "",
      "## Results from your subtasks (synthesize these — do not delegate again)",
      ...children.map((t) => `- ${t.id} "${t.title}" (${t.assignee}, ${t.status}): ${truncate(t.result ?? "(no result)", 1500)}`)
    );
  }

  const inbox = claimInboxFile(co, agent.name, task.id);
  if (fs.existsSync(inbox)) parts.push("", "## Messages for you", truncate(fs.readFileSync(inbox, "utf8").trim(), 4000));

  if (agent.responsibilities.length) {
    parts.push("", "## Your responsibilities", ...agent.responsibilities.map((r) => `- ${r}`));
  }
  const skills = loadSkills(co, agent.skills);
  if (skills) parts.push("", "## Skills", skills);

  parts.push(
    "",
    "## Where things are",
    `- Company folder: ${co.dir}`,
    `- Shared output: ${path.join(co.dir, "data")} (put files and databases you produce here)`,
    `- Your notes: ${path.join(co.agentDir(agent.name), "workspace")}`,
    "- Read anything in the company folder, but never edit tasks/, queue.json, audit.jsonl or other agents' files — use the commands below.",
    agent.toolMode === "company"
      ? "- Use only the ai-company-os tools you were given; do not run other tools or shell commands."
      : "- Outbound messages to people (email, Telegram, webhooks) go through the company only — never send them yourself."
  );

  if (mode === "reply") {
    parts.push(
      "",
      "## How to finish",
      "End your final answer with exactly one JSON object (a ```json block is fine):",
      "",
      "```json",
      `{"action": "done", "result": "what you did, with paths of everything you produced"}`,
      `{"action": "fail", "reason": "why it could not be done"}`
    );
    if (reports.length) {
      parts.push(
        `{"action": "delegate", "subtasks": [{"title": "…", "description": "self-contained instructions", "assignee": "${reports[0]!.name}"}]}`
      );
    }
    parts.push(
      "```",
      "",
      reports.length
        ? `Delegate only to: ${reports.map((r) => r.name).join(", ")} — you get the task back with their results.`
        : "",
      "Plain text without a JSON object counts as your result. Be honest: say what is missing."
    );
    return parts.filter((l) => l !== undefined).join("\n");
  }

  parts.push(
    "",
    "## How to report back",
    `Your lease **${lease.id}** on ${task.id} runs until ${lease.until}. ` +
      `If you work longer, send a heartbeat about every ${beatEvery} min, or the task returns to the queue.`,
    "",
    "```sh",
    `# keep the task (repeat while working)`,
    `${cli} heartbeat ${ids}`,
    `# finished — result text, or --result-file <path> for long results`,
    `${cli} done ${ids} --result "what you did, with paths of everything you produced"`,
    `# could not do it (counts as an attempt; add --no-retry to give up for good)`,
    `${cli} fail ${ids} --reason "why"`,
  );
  if (reports.length) {
    parts.push(
      `# split it up for your reports (JSON array of {title, description, assignee}); you get the task back with their results`,
      `${cli} delegate ${ids} --subtasks '[{"title":"…","description":"…","assignee":"${reports[0]!.name}"}]'`
    );
  }
  parts.push(
    `# tell another agent something`,
    `${cli} message -c ${slug} --as ${agent.name} --to <Agent> --text "…" --task ${task.id}`,
    `# give it back unfinished without counting an attempt`,
    `${cli} release ${ids}`,
    "```",
    "",
    "Finish with exactly one of done / fail / delegate / release. Be honest in the result: say what is missing."
  );

  return parts.filter((l) => l !== undefined).join("\n");
}
