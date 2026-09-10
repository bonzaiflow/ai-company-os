import fs from "node:fs";
import path from "node:path";
import type { AuditEvent } from "../types.js";
import { parseFrontmatter } from "../util.js";
import { listAgentFiles } from "../core/agent-files.js";
import type { Company } from "../core/store.js";

export { listAgentFiles } from "../core/agent-files.js";

export function listInbox(
  co: Company,
  agent: string,
  box: "INBOX" | "OUTBOX" | "INBOX/read" = "INBOX"
): { file: string; from?: string; to?: string; subject?: string; content: string; meta: Record<string, string> }[] {
  const dir = path.join(co.agentDir(agent), box);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const { meta, body } = parseFrontmatter(fs.readFileSync(path.join(dir, f), "utf8"));
      return {
        file: f,
        from: meta.from,
        to: meta.to,
        subject: meta.subject,
        content: body.trim(),
        meta,
      };
    });
}

export function taskAudit(co: Company, id: string): AuditEvent[] {
  const file = path.join(co.dir, "audit.jsonl");
  if (!fs.existsSync(file)) return [];
  const out: AuditEvent[] = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as AuditEvent & { taskId?: string };
      if (e.taskId === id) out.push(e);
    } catch {
      /* skip */
    }
  }
  return out;
}

export function taskDetail(co: Company, id: string) {
  const t = co.loadTask(id);
  const thoughtsFile = path.join(co.agentDir(t.assignee), "workspace", `${id}.md`);
  return {
    task: t,
    children: co.children(id),
    thoughts: fs.existsSync(thoughtsFile) ? fs.readFileSync(thoughtsFile, "utf8") : "",
    audit: taskAudit(co, id).slice(-80),
    inbox: listInbox(co, t.assignee, "INBOX").filter((m) => m.meta.taskId === id),
  };
}

export function companyState(co: Company) {
  const agents = co.listAgents().map((a) => {
    const profileFile = path.join(co.agentDir(a.name), "profile.md");
    return {
      ...a,
      profile: fs.existsSync(profileFile) ? fs.readFileSync(profileFile, "utf8") : "",
      files: listAgentFiles(co, a.name),
      unreadInbox: listInbox(co, a.name, "INBOX").length,
    };
  });
  return {
    meta: co.meta,
    spent: co.spent(),
    agents,
    tasks: co.listTasks(),
    queue: co.queue(),
    audit: co.auditTail(120),
    chat: co.chatHistory(),
    planningChat: co.planningChatHistory(),
  };
}

export function safeCompanyPath(co: Company, rel: string): string {
  const full = path.resolve(co.dir, rel);
  if (full !== co.dir && !full.startsWith(co.dir + path.sep)) {
    throw new Error("path escapes company directory");
  }
  return full;
}
