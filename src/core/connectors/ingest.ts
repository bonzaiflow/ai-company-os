import type { Company } from "../store.js";
import type { InboundEvent } from "./types.js";

/** Deliver an inbound event into an agent's INBOX and optionally enqueue a task. */
export function ingestInbound(
  co: Company,
  event: InboundEvent,
  routeTo?: string
): { agent: string; taskId?: string } {
  const chief = co.chief();
  const agent = routeTo?.trim() || chief?.name || "Chief";
  if (!co.listAgents().some((a) => a.name === agent)) {
    throw new Error(`routeTo agent "${agent}" not found in company`);
  }

  co.sendMessage(event.from, agent, event.subject, event.body, undefined, {
    channel: event.channel,
    externalId: event.externalId,
  });
  co.audit({
    type: `connector.${event.channel}.inbound`,
    ok: true,
    agent,
    detail: `${event.externalId}: ${event.subject}`,
  });

  let taskId: string | undefined;
  if (event.createTask !== false) {
    const task = co.createTask({
      title: `[${event.channel}] ${event.subject}`.slice(0, 120),
      description:
        `Inbound ${event.channel} message from ${event.from}.\n\n` +
        `Subject: ${event.subject}\n` +
        `External id: ${event.externalId}\n\n` +
        `---\n${event.body}`,
      assignee: agent,
      createdBy: `connector:${event.channel}`,
      priority: "high",
    });
    co.enqueue(task.id);
    taskId = task.id;
  }

  return { agent, taskId };
}
