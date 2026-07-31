import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  AgentSpec,
  AuditEvent,
  BudgetCaps,
  BudgetSpent,
  ChatMessage,
  CompanyMeta,
  Plan,
  Rank,
  Task,
  TaskStatus,
} from "../types.js";
import {
  ensureDir,
  nowIso,
  parseFrontmatter,
  readJson,
  serializeFrontmatter,
  slugify,
  writeJson,
} from "../util.js";

/** All state of a company lives on disk inside its directory. This class is a
 * thin, synchronous accessor over those files — the CLI, the runtime, and the
 * web UI all go through it, so any of them can be restarted at any time. */
export class Company {
  constructor(public dir: string) {}

  static list(root: string): string[] {
    const base = path.join(root, "companies");
    if (!fs.existsSync(base)) return [];
    return fs
      .readdirSync(base)
      .filter((d) => fs.existsSync(path.join(base, d, "company.json")));
  }

  static open(root: string, slug: string): Company {
    const dir = path.join(root, "companies", slug);
    if (!fs.existsSync(path.join(dir, "company.json"))) {
      throw new Error(`company "${slug}" not found under ${path.join(root, "companies")}`);
    }
    return new Company(dir);
  }

  static delete(root: string, slug: string): void {
    const dir = path.join(root, "companies", slug);
    if (!fs.existsSync(path.join(dir, "company.json"))) {
      throw new Error(`company "${slug}" not found under ${path.join(root, "companies")}`);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // ---- meta ----

  get meta(): CompanyMeta {
    return readJson<CompanyMeta>(path.join(this.dir, "company.json"), {
      name: "?",
      slug: "?",
      goal: "",
      createdAt: nowIso(),
      budget: { tokens: 0 },
      provider: "ollama-local",
    });
  }

  // ---- agents ----

  agentDir(name: string): string {
    return path.join(this.dir, "agents", name);
  }

  listAgents(): AgentSpec[] {
    const base = path.join(this.dir, "agents");
    if (!fs.existsSync(base)) return [];
    return fs
      .readdirSync(base)
      .filter((d) => fs.existsSync(path.join(base, d, "profile.md")))
      .map((d) => this.loadAgent(d));
  }

  loadAgent(name: string): AgentSpec {
    const raw = fs.readFileSync(path.join(this.agentDir(name), "profile.md"), "utf8");
    const { meta, body } = parseFrontmatter(raw);
    const responsibilities = body
      .split("\n")
      .filter((l) => l.trim().startsWith("- "))
      .map((l) => l.trim().slice(2));
    const list = (s?: string) =>
      (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    return {
      name: meta.name ?? name,
      role: meta.role ?? name,
      rank: (meta.rank as Rank) ?? "worker",
      manager: meta.manager || undefined,
      department: meta.department || undefined,
      responsibilities,
      tools: list(meta.tools),
      skills: list(meta.skills),
      provider: meta.provider || undefined,
      model: meta.model || undefined,
      budgetTokens: meta.budgetTokens ? Number(meta.budgetTokens) : undefined,
    };
  }

  saveAgent(spec: AgentSpec): void {
    const dir = this.agentDir(spec.name);
    for (const sub of ["INBOX", "OUTBOX", "workspace"]) ensureDir(path.join(dir, sub));
    const body =
      `# Agent\n\n## Responsibilities\n` +
      spec.responsibilities.map((r) => `- ${r}`).join("\n") +
      "\n";
    fs.writeFileSync(
      path.join(dir, "profile.md"),
      serializeFrontmatter(
        {
          name: spec.name,
          role: spec.role,
          rank: spec.rank,
          manager: spec.manager ?? "",
          department: spec.department ?? "General",
          tools: spec.tools.join(", "),
          skills: spec.skills.join(", "),
          provider: spec.provider ?? "",
          model: spec.model ?? "",
          budgetTokens: spec.budgetTokens ? String(spec.budgetTokens) : "",
        },
        body
      )
    );
  }

  directReports(name: string): AgentSpec[] {
    return this.listAgents().filter((a) => a.manager === name);
  }

  chief(): AgentSpec | undefined {
    return this.listAgents().find((a) => a.rank === "chief");
  }

  // ---- tasks ----

  private tasksDir(): string {
    return path.join(this.dir, "tasks");
  }

  taskFile(id: string): string {
    return path.join(this.tasksDir(), `${id}.md`);
  }

  nextTaskId(): string {
    const ids = this.listTasks().map((t) => Number(t.id.split("-")[1] ?? 0));
    const n = ids.length ? Math.max(...ids) + 1 : 1;
    return `TASK-${String(n).padStart(4, "0")}`;
  }

  listTasks(): Task[] {
    const dir = this.tasksDir();
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => this.loadTask(f.replace(/\.md$/, "")))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  loadTask(id: string): Task {
    const raw = fs.readFileSync(this.taskFile(id), "utf8");
    const { meta, body } = parseFrontmatter(raw);
    const [description, result] = body.split(/\n## Result\n/);
    return {
      id: meta.id ?? id,
      title: meta.title ?? "",
      status: (meta.status as TaskStatus) ?? "queued",
      assignee: meta.assignee ?? "",
      createdBy: meta.createdBy ?? "user",
      parent: meta.parent || undefined,
      priority: (meta.priority as Task["priority"]) ?? "normal",
      createdAt: meta.createdAt ?? nowIso(),
      updatedAt: meta.updatedAt ?? nowIso(),
      description: description.trim(),
      result: result?.trim() || undefined,
      attempts: meta.attempts ? Number(meta.attempts) : undefined,
      maxAttempts: meta.maxAttempts ? Number(meta.maxAttempts) : undefined,
      target: meta.target ? (JSON.parse(meta.target) as Task["target"]) : undefined,
      continuations: meta.continuations ? Number(meta.continuations) : undefined,
      lastCount: meta.lastCount ? Number(meta.lastCount) : undefined,
      noProgress: meta.noProgress ? Number(meta.noProgress) : undefined,
    };
  }

  saveTask(t: Task): void {
    ensureDir(this.tasksDir());
    t.updatedAt = nowIso();
    const body =
      t.description.trim() + (t.result ? `\n\n## Result\n${t.result.trim()}\n` : "\n");
    fs.writeFileSync(
      this.taskFile(t.id),
      serializeFrontmatter(
        {
          id: t.id,
          title: t.title,
          status: t.status,
          assignee: t.assignee,
          createdBy: t.createdBy,
          parent: t.parent ?? "",
          priority: t.priority,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          attempts: t.attempts ? String(t.attempts) : "",
          maxAttempts: t.maxAttempts ? String(t.maxAttempts) : "",
          target: t.target ? JSON.stringify(t.target) : "",
          continuations: t.continuations ? String(t.continuations) : "",
          lastCount: t.lastCount !== undefined ? String(t.lastCount) : "",
          noProgress: t.noProgress ? String(t.noProgress) : "",
        },
        body
      )
    );
  }

  /** Current row count for a target/goal — the ground truth we drive toward. */
  measure(t: { db?: string; table: string; where?: string }): number {
    const dbPath = path.join(this.dir, "data", t.db && /^[\w.-]+$/.test(t.db) ? t.db : "main.db");
    if (!/^[A-Za-z_][\w]*$/.test(t.table)) return 0;
    if (!fs.existsSync(dbPath)) return 0;
    try {
      const db = new DatabaseSync(dbPath);
      const where = t.where && /^[^;]+$/.test(t.where) ? ` WHERE ${t.where}` : "";
      const row = db.prepare(`SELECT COUNT(*) AS n FROM "${t.table}"${where}`).get() as { n: number };
      db.close();
      return row.n;
    } catch {
      return 0;
    }
  }

  createTask(
    fields: Pick<Task, "title" | "description" | "assignee" | "createdBy"> &
      Partial<Pick<Task, "parent" | "priority" | "target" | "maxAttempts">>
  ): Task {
    const t: Task = {
      id: this.nextTaskId(),
      status: "queued",
      priority: fields.priority ?? "normal",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      ...fields,
    };
    this.saveTask(t);
    this.audit({ type: "task.created", ok: true, taskId: t.id, agent: t.createdBy, detail: t.title });
    return t;
  }

  children(id: string): Task[] {
    return this.listTasks().filter((t) => t.parent === id);
  }

  // ---- queue ----

  private queueFile(): string {
    return path.join(this.dir, "queue.json");
  }

  queue(): string[] {
    return readJson<string[]>(this.queueFile(), []);
  }

  enqueue(id: string): void {
    const q = this.queue();
    if (!q.includes(id)) q.push(id);
    writeJson(this.queueFile(), q);
    this.audit({ type: "queue.enqueue", ok: true, taskId: id });
  }

  /** Put a task at the FRONT of the queue — used when an infrastructure
   * outage interrupted it, so pipeline order is preserved on resume. */
  enqueueFront(id: string): void {
    const q = this.queue().filter((x) => x !== id);
    q.unshift(id);
    writeJson(this.queueFile(), q);
    this.audit({ type: "queue.enqueue", ok: true, taskId: id, detail: "front (resume)" });
  }

  /** Move `ids` (already dependency-ordered: blockers first) to the front of
   * the queue, preserving relative order among the rest. */
  prioritizeInQueue(ids: string[]): void {
    if (!ids.length) return;
    const want = new Set(ids);
    const q = this.queue();
    const promoted = ids.filter((id) => q.includes(id));
    if (!promoted.length) return;
    const rest = q.filter((id) => !want.has(id));
    writeJson(this.queueFile(), [...promoted, ...rest]);
    this.audit({
      type: "queue.prioritize",
      ok: true,
      taskId: promoted[0],
      detail: promoted.join(","),
    });
  }

  /** Insert `id` into the queue immediately after `afterId` (or at front if
   * afterId is missing / not in the queue). Used to park a waiting parent
   * right under its blockers. */
  placeInQueueAfter(id: string, afterId?: string | null): void {
    const q = this.queue().filter((x) => x !== id);
    let at = afterId ? q.indexOf(afterId) : -1;
    if (at < 0) q.unshift(id);
    else q.splice(at + 1, 0, id);
    writeJson(this.queueFile(), q);
    this.audit({
      type: "queue.place",
      ok: true,
      taskId: id,
      detail: afterId ? `after ${afterId}` : "front",
    });
  }

  dequeue(): string | undefined {
    const q = this.queue();
    const id = q.shift();
    if (id !== undefined) {
      writeJson(this.queueFile(), q);
      this.audit({ type: "queue.dequeue", ok: true, taskId: id });
    }
    return id;
  }

  /** Remove specific ids from the queue (claim for a parallel wave). */
  dequeueMany(ids: string[]): void {
    if (!ids.length) return;
    const drop = new Set(ids);
    const q = this.queue().filter((id) => !drop.has(id));
    writeJson(this.queueFile(), q);
    for (const id of ids) {
      this.audit({ type: "queue.dequeue", ok: true, taskId: id, detail: "wave claim" });
    }
  }

  /** Empty the queue file (task statuses are updated by the caller). */
  clearQueue(): void {
    writeJson(this.queueFile(), []);
  }

  // ---- messages (INBOX/OUTBOX) ----

  sendMessage(from: string, to: string, subject: string, content: string, taskId?: string): void {
    const inbox = path.join(this.agentDir(to), "INBOX");
    ensureDir(inbox);
    const file = path.join(inbox, `${taskId ?? "MSG"}-${Date.now()}.md`);
    fs.writeFileSync(
      file,
      serializeFrontmatter(
        { from, to, subject, taskId: taskId ?? "", sentAt: nowIso() },
        content
      )
    );
    this.audit({ type: "delivery.sent", ok: true, agent: from, taskId, detail: `→ ${to}: ${subject}` });
  }

  /** Read and consume unread inbox messages (moved to INBOX/read/). */
  readInbox(agent: string): { from: string; subject: string; content: string }[] {
    const inbox = path.join(this.agentDir(agent), "INBOX");
    if (!fs.existsSync(inbox)) return [];
    const files = fs
      .readdirSync(inbox)
      .filter((f) => f.endsWith(".md"))
      .sort();
    const readDir = path.join(inbox, "read");
    ensureDir(readDir);
    const out = [];
    for (const f of files) {
      const { meta, body } = parseFrontmatter(fs.readFileSync(path.join(inbox, f), "utf8"));
      out.push({ from: meta.from ?? "?", subject: meta.subject ?? "", content: body.trim() });
      fs.renameSync(path.join(inbox, f), path.join(readDir, f));
      this.audit({
        type: "delivery.received",
        ok: true,
        agent,
        taskId: meta.taskId || undefined,
        detail: `from ${meta.from}: ${meta.subject}`,
      });
    }
    return out;
  }

  // ---- workspace (agent thoughts) ----

  appendThought(agent: string, taskId: string, text: string): void {
    const ws = path.join(this.agentDir(agent), "workspace");
    ensureDir(ws);
    fs.appendFileSync(path.join(ws, `${taskId}.md`), text + "\n");
  }

  // ---- audit (tamper-evident hash chain) ----

  /** Every event carries h = sha256(previous h + event body). Any edit or
   * deletion of a past line breaks every hash after it — verifiable with
   * `ai-company-os audit verify`. The head file is just a cache of the last hash. */
  audit(e: Omit<AuditEvent, "ts">): void {
    const headFile = path.join(this.dir, "audit.head");
    let prev = "";
    try {
      prev = fs.readFileSync(headFile, "utf8").trim();
    } catch {}
    const body = { ts: nowIso(), ...e };
    const h = crypto
      .createHash("sha256")
      .update(prev + JSON.stringify(body))
      .digest("hex")
      .slice(0, 16);
    fs.appendFileSync(
      path.join(this.dir, "audit.jsonl"),
      JSON.stringify({ ...body, h }) + "\n"
    );
    fs.writeFileSync(headFile, h);
  }

  /** Recompute the whole chain; returns null if intact, else the first bad line. */
  verifyAudit(): { line: number; reason: string } | null {
    const file = path.join(this.dir, "audit.jsonl");
    if (!fs.existsSync(file)) return null;
    const lines = fs.readFileSync(file, "utf8").trim().split("\n");
    let prev = "";
    for (let i = 0; i < lines.length; i++) {
      let e: Record<string, unknown>;
      try {
        e = JSON.parse(lines[i]);
      } catch {
        return { line: i + 1, reason: "unparseable line" };
      }
      const { h, ...body } = e;
      if (h === undefined) {
        // events from before hash-chaining — allowed only as a prefix
        if (prev !== "") return { line: i + 1, reason: "unhashed event after chained events" };
        continue;
      }
      const expect = crypto
        .createHash("sha256")
        .update(prev + JSON.stringify(body))
        .digest("hex")
        .slice(0, 16);
      if (h !== expect) return { line: i + 1, reason: "hash mismatch (log was altered)" };
      prev = h as string;
    }
    return null;
  }

  auditTail(n: number): AuditEvent[] {
    const file = path.join(this.dir, "audit.jsonl");
    if (!fs.existsSync(file)) return [];
    const lines = fs.readFileSync(file, "utf8").trim().split("\n");
    return lines.slice(-n).map((l) => JSON.parse(l) as AuditEvent);
  }

  // ---- chief chat (UI transcript) ----

  private chatFile(): string {
    return path.join(this.dir, "chat.json");
  }

  private planningChatFile(): string {
    return path.join(this.dir, "planning-chat.json");
  }

  private cleanChatHistory(history: ChatMessage[]): ChatMessage[] {
    return history
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => {
        const out: ChatMessage = { role: m.role, content: m.content };
        if (m.reasoning) out.reasoning = m.reasoning;
        if (Array.isArray(m.created) && m.created.length) {
          out.created = m.created
            .filter((t) => t && typeof t.id === "string")
            .map((t) => ({ id: t.id, title: String(t.title || t.id) }));
        }
        return out;
      });
  }

  /** Persisted senior-agent (chief) chat transcript for the dashboard. */
  chatHistory(): ChatMessage[] {
    const raw = readJson<ChatMessage[]>(this.chatFile(), []);
    return Array.isArray(raw) ? this.cleanChatHistory(raw) : [];
  }

  saveChatHistory(history: ChatMessage[]): void {
    writeJson(this.chatFile(), this.cleanChatHistory(history));
  }

  /** Pre-launch planning transcript archived into the company on launch. */
  planningChatHistory(): ChatMessage[] {
    const raw = readJson<ChatMessage[]>(this.planningChatFile(), []);
    return Array.isArray(raw) ? this.cleanChatHistory(raw) : [];
  }

  savePlanningChat(history: ChatMessage[]): void {
    writeJson(this.planningChatFile(), this.cleanChatHistory(history));
  }

  // ---- budget ----

  private spentFile(): string {
    return path.join(this.dir, "spent.json");
  }

  spent(): BudgetSpent {
    return readJson<BudgetSpent>(this.spentFile(), {
      tokens: 0,
      toolCalls: 0,
      startedAt: this.meta.createdAt,
    });
  }

  addSpent(tokens: number, toolCalls: number, agent?: string): void {
    const s = this.spent();
    s.tokens += tokens;
    s.toolCalls += toolCalls;
    if (agent && tokens > 0) {
      s.byAgent = s.byAgent ?? {};
      s.byAgent[agent] = (s.byAgent[agent] ?? 0) + tokens;
    }
    writeJson(this.spentFile(), s);
  }

  /** Persist changed meta fields (pause, schedule, policies, budget…). */
  saveMeta(patch: Partial<CompanyMeta>): CompanyMeta {
    const meta = { ...this.meta, ...patch };
    writeJson(path.join(this.dir, "company.json"), meta);
    return meta;
  }

  /** Returns a human reason when some budget cap is exhausted, else null. */
  budgetExceeded(): string | null {
    const caps: BudgetCaps = this.meta.budget;
    const s = this.spent();
    if (caps.tokens > 0 && s.tokens >= caps.tokens) return `token cap ${caps.tokens} reached`;
    return null;
  }
}

/** Create a company directory tree from an approved plan. */
export function scaffoldCompany(
  root: string,
  plan: Plan,
  skillDirs: string[],
  provider: string,
  model?: string
): Company {
  const slug = slugify(plan.name);
  const dir = path.join(root, "companies", slug);
  if (fs.existsSync(path.join(dir, "company.json"))) {
    throw new Error(`company "${slug}" already exists`);
  }
  for (const sub of ["agents", "tasks", "data", "skills"]) ensureDir(path.join(dir, sub));

  const meta: CompanyMeta = {
    name: plan.name,
    slug,
    goal: plan.goal,
    createdAt: nowIso(),
    budget: plan.budget,
    provider,
    model,
  };
  writeJson(path.join(dir, "company.json"), meta);
  fs.writeFileSync(
    path.join(dir, "plan.md"),
    `# ${plan.name}\n\n## Goal\n${plan.goal}\n\n## Approach\n${plan.approach}\n`
  );
  writeJson(path.join(dir, "chat.json"), []);

  const co = new Company(dir);
  for (const agent of plan.agents) co.saveAgent(agent);

  // copy every referenced skill folder (SKILL.md + scripts/assets) from the first library that has it
  const wanted = new Set(plan.agents.flatMap((a) => a.skills));
  for (const skill of wanted) {
    for (const lib of skillDirs) {
      const srcDir = path.join(lib, skill);
      if (fs.existsSync(path.join(srcDir, "SKILL.md"))) {
        const destDir = path.join(dir, "skills", skill);
        if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
        fs.cpSync(srcDir, destDir, { recursive: true });
        break;
      }
    }
  }

  co.audit({ type: "company.launched", ok: true, detail: plan.name });

  const chief = plan.agents.find((a) => a.rank === "chief") ?? plan.agents[0];
  for (const rt of plan.rootTasks) {
    const t = co.createTask({
      title: rt.title,
      description: rt.description,
      assignee: chief.name,
      createdBy: "user",
    });
    co.enqueue(t.id);
  }
  return co;
}
