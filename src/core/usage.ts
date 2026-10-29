import { runtimeOf } from "./agent-runtime.js";
import { monthKey, type Company } from "./store.js";

/** Cost view per agent: tokens (internal LLM calls, or what external agents
 * report / adapters parse) and lease minutes (time external/manual agents
 * held tasks — often the only cost signal for agents with their own model). */

export interface AgentUsage {
  name: string;
  runtime: string;
  adapter?: string;
  tokens: number;
  tokensMonth: number;
  minutes: number;
  minutesMonth: number;
  tasksDone: number;
  tasksFailed: number;
  budgetTokens?: number;
  monthlyBudgetTokens?: number;
}

export interface UsageReport {
  month: string;
  tokens: number;
  tokensMonth: number;
  budgetTokens: number;
  monthlyTokens?: number;
  agents: AgentUsage[];
}

export function usageReport(co: Company): UsageReport {
  const spent = co.spent();
  const month = monthKey();
  const m = co.monthSpent(month);
  const tasks = co.listTasks();
  const meta = co.meta;
  return {
    month,
    tokens: spent.tokens,
    tokensMonth: m.tokens,
    budgetTokens: meta.budget.tokens,
    monthlyTokens: meta.budget.monthlyTokens || undefined,
    agents: co.listAgents().map((a) => ({
      name: a.name,
      runtime: runtimeOf(a),
      adapter: a.adapter,
      tokens: spent.byAgent?.[a.name] ?? 0,
      tokensMonth: m.byAgent?.[a.name] ?? 0,
      minutes: spent.minutesByAgent?.[a.name] ?? 0,
      minutesMonth: m.minutesByAgent?.[a.name] ?? 0,
      tasksDone: tasks.filter((t) => t.assignee === a.name && t.status === "done").length,
      tasksFailed: tasks.filter((t) => t.assignee === a.name && t.status === "failed").length,
      budgetTokens: a.budgetTokens,
      monthlyBudgetTokens: a.monthlyBudgetTokens,
    })),
  };
}
