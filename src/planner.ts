import path from "node:path";
import readline from "node:readline/promises";
import type { ChatMessage, LLMProvider, Plan, Rank } from "./types.js";
import { allToolNames } from "./core/tools.js";
import { c, extractJson, slugify, truncate, writeJson } from "./util.js";

export const PLAN_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    plan: {
      type: "object",
      properties: {
        name: { type: "string" },
        goal: { type: "string" },
        approach: { type: "string" },
        agents: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              role: { type: "string" },
              rank: { type: "string", enum: ["chief", "manager", "worker"] },
              manager: { type: "string" },
              responsibilities: { type: "array", items: { type: "string" } },
              tools: { type: "array", items: { type: "string" } },
              skills: { type: "array", items: { type: "string" } },
            },
            required: ["name", "role", "rank", "responsibilities", "tools"],
            additionalProperties: false,
          },
        },
        budget: {
          type: "object",
          properties: {
            tokens: { type: "number" },
          },
          required: ["tokens"],
          additionalProperties: false,
        },
        rootTasks: {
          type: "array",
          items: {
            type: "object",
            properties: { title: { type: "string" }, description: { type: "string" } },
            required: ["title", "description"],
            additionalProperties: false,
          },
        },
        todos: { type: "array", items: { type: "string" } },
        deliverables: {
          type: "array",
          items: {
            type: "object",
            properties: {
              file: { type: "string" },
              kind: { type: "string" },
              description: { type: "string" },
            },
            required: ["file", "kind"],
            additionalProperties: false,
          },
        },
        storage: {
          type: "array",
          items: {
            type: "object",
            properties: {
              db: { type: "string" },
              table: { type: "string" },
              purpose: { type: "string" },
            },
            required: ["table"],
            additionalProperties: false,
          },
        },
      },
      required: ["name", "goal", "approach", "agents", "budget", "rootTasks", "todos", "deliverables", "storage"],
    },
  },
  required: ["reply", "plan"],
} as const;

export function plannerSystem(availableSkills: string[]): string {
  return [
    "You are the planning consultant of an agent-orchestration system. The user describes a goal;",
    "you design a small company of LLM agents to achieve it.",
    "",
    "Every answer is ONE JSON object: {\"reply\": \"...\", \"plan\": {...}}.",
    "reply = your short message to the user (ask at most 1-2 clarifying questions when needed).",
    "plan = your current full draft, refined every turn. Always include the complete plan.",
    "",
    "Plan rules:",
    "- Exactly ONE agent with rank chief (the coordinator). Workers report to a manager or the chief.",
    "- 2-6 agents total. Keep the hierarchy shallow (chief → workers, or chief → 1 manager → workers).",
    "- Agent names: single CamelCase words (LeadScraper). manager = name of another agent.",
    `- Every agent automatically has filesystem and sqlite (sandboxed to the company folder).`,
    `- tools per agent: list only NETWORK tools an agent needs, from: fetch, search, discover. Chiefs/managers usually need none.`,
    `  (discover = bulk OpenStreetMap/web discovery that writes real businesses straight into a db table — use it for large lead lists.`,
    `   every agent also has importdata for owner-uploaded files in data/uploads/ — plan an import step when uploads exist.)`,
    `- skills, choose from: ${availableSkills.join(", ") || "(none)"} — or leave empty.`,
    "- responsibilities: 2-4 short bullets each.",
    "- rootTasks: 1-3 initial tasks for the chief, phrased as outcomes.",
    "- budget: token cap only, e.g. 150000-2000000 tokens.",
    "- todos: 4-8 concrete requirements that must be fulfilled for the company to be on track",
    "  (e.g. 'firms table contains 10 rows with non-null website', 'every email has an email_source').",
    "- deliverables: the output files the company will produce, each {file, kind, description}",
    "  with kind one of: csv, md, json, pdf, db, txt.",
    "- storage: what must be stored in SQLite: [{db: 'main.db', table, purpose}] — [] if nothing.",
    "- These agents run on small local models: keep roles narrow and instructions concrete.",
  ].join("\n");
}

/** Fix common small-model plan defects instead of rejecting the plan. */
export function normalizePlan(raw: Plan): Plan {
  const plan: Plan = {
    name: raw.name?.trim() || "New Company",
    goal: raw.goal ?? "",
    approach: raw.approach ?? "",
    agents: (raw.agents ?? []).map((a) => ({
      name: (a.name ?? "Agent").replace(/[^A-Za-z0-9]/g, "") || "Agent",
      role: a.role ?? a.name ?? "Agent",
      rank: (["chief", "manager", "worker"].includes(a.rank) ? a.rank : "worker") as Rank,
      manager: a.manager?.replace(/[^A-Za-z0-9]/g, "") || undefined,
      department: a.department ?? "General",
      responsibilities: a.responsibilities?.length ? a.responsibilities : [a.role ?? "Do the work"],
      tools: a.tools ?? [],
      skills: a.skills ?? [],
      provider: a.provider,
      model: a.model,
    })),
    budget: {
      tokens: raw.budget?.tokens || 500_000,
    },
    rootTasks: (raw.rootTasks ?? []).filter((t) => t.title),
    todos: (raw.todos ?? []).filter(Boolean),
    deliverables: (raw.deliverables ?? []).filter((d) => d.file),
    storage: (raw.storage ?? []).filter((s) => s.table),
  };

  if (!plan.agents.length) {
    plan.agents.push({
      name: "Chief",
      role: "Coordinator",
      rank: "chief",
      responsibilities: ["Coordinate the work", "Report results"],
      tools: [],
      skills: [],
    });
  }

  // unique names — models happily reuse a name, which would collide on disk
  const seen = new Map<string, number>();
  for (const a of plan.agents) {
    const n = seen.get(a.name) ?? 0;
    seen.set(a.name, n + 1);
    if (n > 0) a.name = `${a.name}${n + 1}`;
  }

  // exactly one chief
  const chiefs = plan.agents.filter((a) => a.rank === "chief");
  if (!chiefs.length) plan.agents[0].rank = "chief";
  else chiefs.slice(1).forEach((a) => (a.rank = "manager"));
  const chief = plan.agents.find((a) => a.rank === "chief")!;
  chief.manager = undefined;

  // every non-chief needs a valid manager; orphans go to the chief
  const names = new Set(plan.agents.map((a) => a.name));
  for (const a of plan.agents) {
    if (a.rank === "chief") continue;
    if (!a.manager || !names.has(a.manager) || a.manager === a.name) a.manager = chief.name;
  }

  if (!plan.rootTasks.length) {
    plan.rootTasks.push({ title: plan.goal || plan.name, description: plan.goal || plan.name });
  }
  return plan;
}

export function renderPlan(plan: Plan): string {
  const lines = [
    c.bold(`Plan: ${plan.name}`),
    c.dim(plan.goal),
    "",
    plan.approach,
    "",
    c.bold("Agents:"),
  ];
  for (const a of plan.agents) {
    lines.push(
      `  ${c.cyan(a.name.padEnd(16))} ${a.rank.padEnd(8)} ${c.dim(`mgr: ${a.manager ?? "—"}`)}  tools: ${a.tools.join(",") || "—"}  skills: ${a.skills.join(",") || "—"}`
    );
  }
  lines.push(
    "",
    c.bold("Root tasks:"),
    ...plan.rootTasks.map((t) => `  • ${t.title}`),
    "",
    c.dim(`Budget: ${plan.budget.tokens.toLocaleString()} tokens`)
  );
  return lines.join("\n");
}

export function savePlan(root: string, plan: Plan): string {
  // one folder per plan so it can be shared as a unit
  const file = path.join(root, "plans", slugify(plan.name), "plan.json");
  writeJson(file, plan);
  return file;
}

export async function planTurn(
  provider: LLMProvider,
  history: ChatMessage[]
): Promise<{ reply: string; plan: Plan }> {
  // small models occasionally emit truncated/malformed JSON — just retry
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await provider.chat(history, { schema: PLAN_SCHEMA, temperature: 0.5 });
    try {
      const parsed = extractJson(res.content) as { reply: string; plan: Plan };
      return { reply: parsed.reply ?? "", plan: normalizePlan(parsed.plan) };
    } catch (e) {
      lastErr = e as Error;
    }
  }
  throw new Error(`planner produced no valid JSON after 3 attempts (${lastErr?.message})`);
}

export async function planOnce(
  provider: LLMProvider,
  goal: string,
  availableSkills: string[]
): Promise<Plan> {
  const { plan } = await planTurn(provider, [
    { role: "system", content: plannerSystem(availableSkills) },
    {
      role: "user",
      content: `Design the company for this goal. No questions — produce your best complete plan.\n\nGoal: ${goal}`,
    },
  ]);
  return plan;
}

export async function planInteractive(
  provider: LLMProvider,
  root: string,
  availableSkills: string[],
  initialGoal?: string
): Promise<{ plan: Plan; launch: boolean } | null> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const history: ChatMessage[] = [
    { role: "system", content: plannerSystem(availableSkills) },
  ];
  let plan: Plan | null = null;

  console.log(
    c.dim(
      `Planning with ${provider.name}/${provider.model}. Describe your goal.\nCommands: /launch  /save  /quit\n`
    )
  );

  let pending = initialGoal;
  try {
    while (true) {
      const input = pending ?? (await rl.question(c.bold("you> ")));
      pending = undefined;
      const cmd = input.trim();
      if (!cmd) continue;
      if (cmd === "/quit") return plan ? { plan, launch: false } : null;
      if (cmd === "/save") {
        if (plan) console.log(c.green(`saved → ${savePlan(root, plan)}`));
        else console.log(c.yellow("no plan drafted yet"));
        continue;
      }
      if (cmd === "/launch") {
        if (!plan) {
          console.log(c.yellow("no plan drafted yet"));
          continue;
        }
        return { plan, launch: true };
      }

      history.push({ role: "user", content: cmd });
      process.stdout.write(c.dim("thinking…\r"));
      try {
        const turn = await planTurn(provider, history);
        plan = turn.plan;
        history.push({ role: "assistant", content: JSON.stringify(turn) });
        console.log(`\n${c.magenta("planner>")} ${turn.reply}\n`);
        console.log(renderPlan(plan));
        console.log(c.dim("\n/launch to launch this · /save to save · keep chatting to refine\n"));
      } catch (e) {
        console.log(c.red(`planner error: ${(e as Error).message}`));
      }
    }
  } finally {
    rl.close();
  }
}
