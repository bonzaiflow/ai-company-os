import fs from "node:fs";
import path from "node:path";
import { taskAudit } from "../core/audit-read.js";
import type { Company } from "../core/store.js";
import type { Task } from "../types.js";
import { parseFrontmatter } from "../util.js";

function taskMessages(co: Company, id: string) {
  const out: {
    agent: string;
    box: string;
    from: string;
    to: string;
    subject: string;
    sentAt: string;
    content: string;
  }[] = [];
  for (const a of co.listAgents()) {
    for (const box of ["INBOX", path.join("INBOX", "read"), "OUTBOX"]) {
      const dir = path.join(co.agentDir(a.name), box);
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (!f.startsWith(id) || !f.endsWith(".md")) continue;
        const { meta, body } = parseFrontmatter(fs.readFileSync(path.join(dir, f), "utf8"));
        out.push({
          agent: a.name,
          box: box.startsWith("INBOX") ? "inbox" : "outbox",
          from: meta.from ?? "?",
          to: meta.to ?? a.name,
          subject: meta.subject ?? "",
          sentAt: meta.sentAt ?? "",
          content: body.trim().slice(0, 2000),
        });
      }
    }
  }
  // inbox + its read/ copy are the same physical message moved, not two sends
  const seen = new Set<string>();
  return out
    .filter((m) => {
      const key = m.box + "|" + m.from + "|" + m.to + "|" + m.subject + "|" + m.sentAt;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((x, y) => x.sentAt.localeCompare(y.sentAt));
}

export function taskDetail(co: Company, id: string) {
  const task = co.loadTask(id);
  const shallow = (t: Task) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    assignee: t.assignee,
    result: t.result ? t.result.slice(0, 500) : undefined,
  });
  const thoughtsFile = path.join(co.agentDir(task.assignee), "workspace", `${id}.md`);
  const queue = co.queue();
  return {
    task,
    raw: fs.readFileSync(co.taskFile(id), "utf8"),
    parent: task.parent ? shallow(co.loadTask(task.parent)) : null,
    children: co.children(id).map(shallow),
    audit: taskAudit(co, id),
    thoughts: fs.existsSync(thoughtsFile)
      ? fs.readFileSync(thoughtsFile, "utf8").slice(-30_000)
      : "",
    messages: taskMessages(co, id),
    queuePos: queue.indexOf(id),
    queueLen: queue.length,
  };
}
