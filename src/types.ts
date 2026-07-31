export type Rank = "chief" | "manager" | "worker";

export interface AgentSpec {
  name: string;
  role: string;
  rank: Rank;
  manager?: string;
  department?: string;
  responsibilities: string[];
  tools: string[];
  skills: string[];
  /** provider name from config; falls back to company default */
  provider?: string;
  /** model override; falls back to provider default */
  model?: string;
  /** per-agent token cap; agent stops receiving tasks when exceeded */
  budgetTokens?: number;
}

export type TaskStatus = "queued" | "running" | "waiting" | "done" | "failed";

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  assignee: string;
  createdBy: string;
  parent?: string;
  priority: "low" | "normal" | "high";
  createdAt: string;
  updatedAt: string;
  description: string;
  result?: string;
  /** failed attempts so far; task only goes terminally failed at maxAttempts */
  attempts?: number;
  maxAttempts?: number;
  /** measurable done-condition: keep continuing the task until the row count
   * is reached (or progress stalls). This is how "find 10000" actually works —
   * one tick can't do it, so the engine re-drives the same task. */
  target?: TaskTarget;
  /** continuation bookkeeping (engine-managed) */
  continuations?: number;
  lastCount?: number;
  /** consecutive step-limit ticks with no successful tool action (stuck guard) */
  noProgress?: number;
  /** transient: shortfall note stamped when a target stalls (not persisted) */
  _partialNote?: string;
}

export interface TaskTarget {
  metric: "rows";
  table: string;
  db?: string;
  where?: string;
  count: number;
}

/** A company-level numeric goal the chief re-plans against when the queue
 * drains (e.g. "leads table ≥ 10000"). Set/raised from the chief chat. */
export interface CompanyTarget {
  label: string;
  table: string;
  db?: string;
  where?: string;
  count: number;
}

export interface BudgetCaps {
  tokens: number;
  /** Legacy field — no longer enforced */
  hours?: number;
}

export interface BudgetSpent {
  tokens: number;
  toolCalls: number;
  startedAt: string;
  /** tokens per agent, for per-agent budget enforcement */
  byAgent?: Record<string, number>;
}

export interface Approval {
  id: string;
  ts: string;
  agent: string;
  taskId: string;
  tool: string;
  args: Record<string, unknown>;
  status: "pending" | "approved" | "denied" | "consumed";
  decidedAt?: string;
  note?: string;
}

export interface RecurringTask {
  title: string;
  description: string;
  assignee?: string;
  everyHours: number;
  lastCreatedAt?: string;
}

export interface CompanyMeta {
  name: string;
  slug: string;
  goal: string;
  createdAt: string;
  budget: BudgetCaps;
  /** default provider name (from ai-company-os.json) for agents without their own */
  provider: string;
  model?: string;
  /** optional per-company overrides (part of the shareable folder settings);
   * take precedence over the workspace-level roles/models */
  roles?: RoleDefaults;
  models?: RoleDefaults;
  /** owner control: a paused company never ticks */
  paused?: boolean;
  /** perpetual operation: the daemon wakes the company on this cadence */
  schedule?: { everyMinutes: number; maxTicks?: number; active: boolean; lastWakeAt?: string };
  /** owner check-ins: the chief writes a brief on this cadence */
  checkins?: { everyHours: number; lastAt?: string };
  /** governance: tool names that need owner approval before executing */
  policies?: { approveTools?: string[] };
  /** numeric goals the chief auto-replans toward when the queue empties */
  targets?: CompanyTarget[];
}

export interface AuditEvent {
  ts: string;
  type: string;
  ok: boolean;
  agent?: string;
  taskId?: string;
  detail?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /** Optional model reasoning, shown in the UI when present. */
  reasoning?: string;
  /** Tasks the chief created in this turn (UI renders as task cards). */
  created?: { id: string; title: string }[];
}

export interface LLMResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  reasoning?: string;
}

/** Incremental tokens from a streaming chat call. */
export interface StreamChunk {
  content?: string;
  reasoning?: string;
  promptTokens?: number;
  completionTokens?: number;
}

export interface LLMProvider {
  name: string;
  model: string;
  chat(
    messages: ChatMessage[],
    opts?: { schema?: object; temperature?: number }
  ): Promise<LLMResult>;
  /** Optional streaming variant. Falls back to a single `chat` chunk when absent. */
  chatStream?(
    messages: ChatMessage[],
    opts?: { schema?: object; temperature?: number }
  ): AsyncIterable<StreamChunk>;
}

export interface ProviderConfig {
  type: "ollama" | "openrouter" | "cursor" | "claude" | "mock";
  baseUrl?: string;
  model?: string;
  apiKeyEnv?: string;
  /** cursor only: CLI binary (default "cursor-agent") */
  command?: string;
  /** mock only: path to a JSON file with an array of canned responses */
  script?: string;
  /** false = never send a JSON schema (grammar constraint); rely on prompt +
   * lenient parsing + the execution-role repair pass instead. For backends
   * whose models can write JSON but have no structured-output support. */
  structured?: boolean;
}

/** Default provider per role. Precedence for agents at runtime:
 * agent profile > roles.agents > company default. */
export interface RoleDefaults {
  planning?: string;
  agents?: string;
  /** used for mechanical JSON work: repairing malformed action output from
   * models that can't reliably emit clean JSON — a small fast model fits */
  execution?: string;
}

export interface AiCompanyOsConfig {
  providers: Record<string, ProviderConfig>;
  defaultProvider: string;
  roles?: RoleDefaults;
  /** per-role model override (pairs with roles: source + model) */
  models?: RoleDefaults;
  /** last workspace folder opened in the dashboard (user config only) */
  workspaceRoot?: string;
}

/** One decision emitted by an agent per step. Flat on purpose: small models
 * handle a single flat object far better than nested oneOf unions. */
export interface AgentAction {
  thought: string;
  action: "tool" | "delegate" | "message" | "complete";
  tool?: string;
  args?: Record<string, unknown>;
  subtasks?: { title: string; description: string; assignee: string }[];
  to?: string;
  content?: string;
  result?: string;
}

export interface Plan {
  name: string;
  goal: string;
  approach: string;
  agents: AgentSpec[];
  budget: BudgetCaps;
  rootTasks: { title: string; description: string }[];
  /** requirements that must hold for the company to be on track */
  todos?: string[];
  /** expected output artifacts (csv, md, json, pdf, …) */
  deliverables?: { file: string; kind: string; description?: string }[];
  /** sqlite storage the company will need */
  storage?: { db?: string; table: string; purpose?: string }[];
}
