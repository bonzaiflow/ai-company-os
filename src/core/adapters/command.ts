import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveCliCommand } from "../../llm/index.js";
import type { AgentRuntimeConfig, AgentSpec, AiCompanyOsConfig, Task } from "../../types.js";
import { truncate } from "../../util.js";
import { leaseMinutesFor } from "../agent-runtime.js";
import { renderBrief, workspaceRootOf } from "../brief.js";
import {
  delegateHeld,
  failHeld,
  finishTask,
  heartbeat,
  keepClaimInbox,
  releaseTask,
  WorkError,
} from "../lease.js";
import type { Company } from "../store.js";
import type { TickResult } from "../tick-types.js";
import type { SubtaskSpec } from "../work.js";

/** Push adapter: the engine starts an external agent CLI (Codex, Claude Code,
 * Cursor, …) for one claimed task, from a command template in
 * ai-company-os.json → agentRuntimes. The agent gets the brief as its prompt
 * and finishes with a JSON reply ({"action":"done"|"fail"|"delegate", …});
 * it may instead report through `work …` itself if it has a shell. The
 * engine keeps the lease alive while the process runs and enforces the
 * time cap. Nothing here is specific to one vendor — new agents are config. */

const DEFAULT_TIMEOUT_MIN = 60;

export function expandHome(p: string): string {
  return p.startsWith("~/") || p === "~" ? path.join(os.homedir(), p.slice(1)) : p;
}

/** The run directory: the agent's workspace, or its `cwd:` if allowed. */
export function resolveCwd(cfg: AiCompanyOsConfig, co: Company, agent: AgentSpec): string {
  const ws = path.join(co.agentDir(agent.name), "workspace");
  if (!agent.cwd) return ws;
  const want = path.resolve(expandHome(agent.cwd));
  const allowed = (cfg.allowedCwds ?? []).map((d) => path.resolve(expandHome(d)));
  if (!allowed.some((d) => want === d || want.startsWith(d + path.sep))) {
    throw new Error(`cwd ${want} of ${agent.name} is not under allowedCwds in ai-company-os.json`);
  }
  if (!fs.existsSync(want)) throw new Error(`cwd ${want} of ${agent.name} does not exist`);
  return want;
}

export type Reply =
  | { action: "done"; result: string }
  | { action: "fail"; reason: string }
  | { action: "delegate"; subtasks: SubtaskSpec[] };

/** The last JSON object in the text that is a valid reply action. */
export function parseReply(text: string): Reply | null {
  let found: Reply | null = null;
  for (let i = text.indexOf("{"); i !== -1; i = text.indexOf("{", i + 1)) {
    const end = matchBrace(text, i);
    if (end === -1) continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(text.slice(i, end + 1));
    } catch {
      continue;
    }
    if (obj.action === "done" && typeof obj.result === "string") found = { action: "done", result: obj.result };
    else if (obj.action === "fail" && typeof obj.reason === "string") found = { action: "fail", reason: obj.reason };
    else if (obj.action === "delegate" && Array.isArray(obj.subtasks)) {
      found = { action: "delegate", subtasks: obj.subtasks as SubtaskSpec[] };
    }
  }
  return found;
}

function matchBrace(s: string, start: number): number {
  let depth = 0;
  let inStr = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === "\\") i++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return i;
  }
  return -1;
}

/** Reply text and token usage from the process output. */
export function readOutput(rt: AgentRuntimeConfig, stdout: string, outputFile: string): { text: string; tokens?: number } {
  let text = stdout;
  let tokens: number | undefined;
  if (rt.usage === "claude-json") {
    try {
      const j = JSON.parse(stdout.trim()) as { result?: string; usage?: Record<string, number> };
      if (typeof j.result === "string") text = j.result;
      if (j.usage) {
        tokens = ["input_tokens", "output_tokens", "cache_creation_input_tokens"].reduce((n, k) => n + (j.usage![k] ?? 0), 0);
      }
    } catch {
      // not JSON (e.g. an error banner) — keep raw stdout
    }
  }
  try {
    const file = fs.readFileSync(outputFile, "utf8");
    if (file.trim()) text = file;
  } catch {}
  return { text: text.trim(), tokens };
}

function fill(arg: string, vars: Record<string, string>): string {
  return arg.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k]! : m));
}

/** Run one push task to a decision. The task is already claimed (running,
 * push lease) by claimReadyWave. */
export async function runPush(
  co: Company,
  cfg: AiCompanyOsConfig,
  task: Task,
  agent: AgentSpec,
  opts: { log?: (l: string) => void; shouldStop?: () => boolean } = {}
): Promise<TickResult> {
  const log = opts.log ?? (() => {});
  const lease = task.lease!;
  const rt = agent.adapter ? cfg.agentRuntimes?.[agent.adapter] : undefined;

  let cwd: string;
  try {
    if (!rt) throw new Error(`agent runtime "${agent.adapter}" is not defined in ai-company-os.json → agentRuntimes`);
    cwd = resolveCwd(cfg, co, agent);
  } catch (e) {
    // configuration problem, not the task's fault: hand it back and say so
    releaseTask(co, task.id, lease.id, (e as Error).message);
    co.audit({ type: "provider.unavailable", ok: false, taskId: task.id, agent: agent.name, detail: (e as Error).message });
    return { status: "provider", taskId: task.id, detail: (e as Error).message };
  }

  keepClaimInbox(co, agent.name, task.id);
  const ws = path.join(co.agentDir(agent.name), "workspace");
  fs.mkdirSync(ws, { recursive: true });
  const promptFile = path.join(ws, `${task.id}.brief.md`);
  const outputFile = path.join(ws, `${task.id}.out.md`);
  const logFile = path.join(ws, `${task.id}.log`);
  const prompt = renderBrief(co, task, agent, lease, "reply");
  fs.writeFileSync(promptFile, prompt);
  fs.rmSync(outputFile, { force: true });

  const vars: Record<string, string> = {
    prompt,
    promptFile,
    outputFile,
    taskId: task.id,
    agent: agent.name,
    company: path.basename(co.dir),
    companyDir: co.dir,
    cwd,
    lease: lease.id,
  };
  const argv = rt!.argv.map((a) => fill(a, vars));
  const env = {
    ...process.env,
    ...(rt!.env ?? {}),
    AI_COMPANY_OS_ROOT: workspaceRootOf(co),
    AI_COMPANY_OS_COMPANY: path.basename(co.dir),
    AI_COMPANY_OS_AGENT: agent.name,
    AI_COMPANY_OS_TASK: task.id,
    AI_COMPANY_OS_LEASE: lease.id,
  };
  const timeoutMin = agent.maxMinutesPerTask ?? rt!.timeoutMinutes ?? DEFAULT_TIMEOUT_MIN;

  log(`▶ ${task.id} "${task.title}" → ${agent.name} [push/${agent.adapter}]`);
  co.appendThought(agent.name, task.id, `\n## Push run ${new Date().toISOString()} (${agent.adapter}, lease ${lease.id})`);
  const logStream = fs.createWriteStream(logFile, { flags: "a" });
  logStream.write(`\n# ${new Date().toISOString()} ${argv[0]} (${argv.length - 1} args) in ${cwd}\n`);

  let stdout = "";
  let stderr = "";
  let killedFor: string | undefined;
  const code = await new Promise<number | null>((resolve) => {
    const child = spawn(resolveCliCommand(argv[0]!), argv.slice(1), { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    const stop = (why: string) => {
      if (killedFor) return;
      killedFor = why;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 10_000).unref();
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d: string) => {
      stdout += d;
      logStream.write(d);
    });
    child.stderr.on("data", (d: string) => {
      stderr += d;
      logStream.write(d);
    });
    const beatMs = Math.max(30_000, (leaseMinutesFor(agent) * 60_000) / 3);
    const beat = setInterval(() => {
      try {
        heartbeat(co, task.id, lease.id);
      } catch (e) {
        // the agent finished via `work …` itself, or the owner took the task away
        if (e instanceof WorkError && e.kind === "lease") stop("lease no longer held");
      }
    }, beatMs);
    const poll = setInterval(() => {
      if (opts.shouldStop?.()) stop("stopped by owner");
    }, 1000);
    const timer = setTimeout(() => stop(`time cap ${timeoutMin} min reached`), timeoutMin * 60_000);
    const done = (c: number | null) => {
      clearInterval(beat);
      clearInterval(poll);
      clearTimeout(timer);
      resolve(c);
    };
    child.on("error", (err) => {
      stderr += String(err.message);
      done(null);
    });
    child.on("close", done);
  });
  logStream.end(`\n# exit ${code}${killedFor ? ` (${killedFor})` : ""}\n`);

  // did the agent already report through the CLI/MCP contract?
  const now = co.loadTask(task.id);
  if (now.status !== "running" || now.lease?.id !== lease.id) {
    log(`  ✓ ${task.id} reported by ${agent.name} itself (${now.status})`);
    return { status: "worked", taskId: task.id, detail: `reported via contract (${now.status})` };
  }

  if (killedFor === "stopped by owner") {
    releaseTask(co, task.id, lease.id, "stopped by owner");
    return { status: "stopped", taskId: task.id, detail: "paused by owner" };
  }
  if (code !== 0 || killedFor) {
    const why = killedFor ?? `exit ${code}`;
    failHeld(co, task.id, lease.id, `${agent.adapter} run failed (${why}): ${truncate(stderr.trim() || stdout.trim(), 300)}`);
    log(`  ✗ ${task.id} ${why}`);
    return { status: "worked", taskId: task.id, detail: why };
  }

  const { text, tokens } = readOutput(rt!, stdout, outputFile);
  const reply = parseReply(text);
  try {
    if (reply?.action === "delegate") {
      const o = delegateHeld(co, task.id, lease.id, reply.subtasks);
      log(`  ⇒ delegated ${o.ok ? o.created.length : 0} subtask(s), ${task.id} now waiting`);
      if (tokens) co.addSpent(tokens, 0, agent.name);
      return { status: "worked", taskId: task.id, detail: "delegated" };
    }
    if (reply?.action === "fail") {
      if (tokens) co.addSpent(tokens, 0, agent.name);
      failHeld(co, task.id, lease.id, reply.reason);
      log(`  ✗ ${task.id} agent reported failure`);
      return { status: "worked", taskId: task.id, detail: "agent failed" };
    }
    if (!reply && (rt!.onExit ?? "stdout") === "strict") {
      if (tokens) co.addSpent(tokens, 0, agent.name);
      failHeld(co, task.id, lease.id, `no JSON reply in output: ${truncate(text, 300)}`);
      return { status: "worked", taskId: task.id, detail: "no reply" };
    }
    const result = reply?.action === "done" ? reply.result : text || "(no output)";
    const o = finishTask(co, task.id, lease.id, result, { tokens, via: reply ? "reply" : "stdout" });
    log(`  ✓ ${task.id} ${o.status}`);
    return { status: "worked", taskId: task.id, detail: o.status };
  } catch (e) {
    if (!(e instanceof WorkError)) throw e;
    // invalid delegation etc.: count an attempt and let the agent try again
    if (e.kind !== "lease") failHeld(co, task.id, lease.id, e.message);
    return { status: "worked", taskId: task.id, detail: e.message };
  }
}
