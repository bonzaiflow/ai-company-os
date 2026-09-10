import path from "node:path";
import { loadConfig } from "../../config.js";
import type { AiCompanyOsConfig, ChatMessage, TelegramConnectorConfig } from "../../types.js";
import { truncate } from "../../util.js";
import { chiefChat } from "../chat.js";
import { decideApproval, listApprovals } from "../governance.js";
import { runLoop } from "../runtime.js";
import type { Company } from "../store.js";
import { ingestInbound } from "./ingest.js";
import {
  assertAllowedChat,
  isChatAllowed,
  telegramToken,
  tgAnswerCallback,
  tgEditMessageText,
  tgSendMessage,
  type InlineKeyboard,
  type TgUpdate,
} from "./telegram-api.js";

/** Workspace root from company dir (`…/companies/<slug>`). */
function workspaceRootOf(co: Company): string {
  return path.dirname(path.dirname(co.dir));
}

const CB = {
  menu: "t:m",
  status: "t:s",
  queue: "t:q",
  run: "t:r",
  pause: "t:p",
  approvals: "t:a",
  help: "t:h",
  chat: "t:c",
} as const;

function btn(text: string, data: string) {
  return { text, callback_data: data };
}

/** Main control pad shown after most replies. */
export function mainMenuKeyboard(paused: boolean): InlineKeyboard {
  return {
    inline_keyboard: [
      [btn("Status", CB.status), btn("Queue", CB.queue)],
      [btn("Run", CB.run), btn(paused ? "Resume" : "Pause", CB.pause)],
      [btn("Approvals", CB.approvals), btn("Chat tip", CB.chat)],
      [btn("Menu", CB.menu), btn("Help", CB.help)],
    ],
  };
}

function approvalsKeyboard(
  pending: { id: string }[]
): InlineKeyboard {
  const rows: { text: string; callback_data: string }[][] = [];
  for (const a of pending.slice(0, 8)) {
    rows.push([
      btn(`✓ ${a.id}`, `t:aa:${a.id}`),
      btn(`✗ ${a.id}`, `t:ad:${a.id}`),
    ]);
  }
  rows.push([btn("« Menu", CB.menu)]);
  return { inline_keyboard: rows };
}

function companyStatus(co: Company): string {
  const tasks = co.listTasks();
  const by = (s: string) => tasks.filter((t) => t.status === s).length;
  const spent = co.spent();
  const budget = co.meta.budget.tokens;
  const pct = budget > 0 ? Math.max(0, Math.round(100 - (spent.tokens / budget) * 100)) : 100;
  const pending = listApprovals(co, "pending").length;
  const lines = [
    `🏢 ${co.meta.name} (${co.meta.slug})`,
    co.meta.paused ? "⏸ PAUSED" : "▶ running",
    `Goal: ${truncate(co.meta.goal, 200)}`,
    `Queue: ${co.queue().length} · pending approvals: ${pending}`,
    `Tasks: ${tasks.length} total — ${by("done")} done, ${by("running")} running, ${by("waiting")} waiting, ${by("queued")} queued, ${by("failed")} failed`,
    `Budget: ${pct}% left · ${spent.tokens.toLocaleString()} tokens · ${spent.toolCalls} tools`,
  ];
  return lines.join("\n");
}

function queueSummary(co: Company): string {
  const q = co.queue();
  if (!q.length) return "Queue is empty.";
  const lines = [`Queue (${q.length}):`];
  for (const id of q.slice(0, 15)) {
    const t = co.loadTask(id);
    lines.push(`• ${id} [${t.status}] ${truncate(t.title, 60)} → ${t.assignee}`);
  }
  if (q.length > 15) lines.push(`… +${q.length - 15} more`);
  return lines.join("\n");
}

function helpText(): string {
  return [
    "ai-company-os Telegram bot",
    "",
    "Buttons drive the same ops as the dashboard/CLI.",
    "Free-text messages chat with the chief (shared chat history).",
    "",
    "Commands:",
    "/start /menu — control pad",
    "/status /queue /run /pause /resume",
    "/approvals — list + approve/deny buttons",
    "/chat <message> — talk to the chief",
    "/task <text> — create INBOX + high-priority task (legacy)",
    "/help — this text",
  ].join("\n");
}

function welcomeText(co: Company): string {
  return [
    `Connected to ${co.meta.name}.`,
    "Use the buttons below, or send a message to chat with the chief.",
  ].join("\n");
}

async function reply(
  token: string,
  chatId: string,
  text: string,
  keyboard?: InlineKeyboard,
  edit?: { messageId: number }
): Promise<void> {
  if (edit) {
    try {
      await tgEditMessageText(token, {
        chatId,
        messageId: edit.messageId,
        text,
        replyMarkup: keyboard,
      });
      return;
    } catch {
      // fall through to send if edit fails (e.g. identical content)
    }
  }
  await tgSendMessage(token, { chatId, text, replyMarkup: keyboard });
}

async function runTicks(co: Company, cfg: AiCompanyOsConfig, maxTicks = 5): Promise<string> {
  if (co.meta.paused) return "Company is paused — resume first.";
  if (!co.queue().length && !co.listTasks().some((t) => t.status === "waiting")) {
    return "Nothing to run — queue is empty.";
  }
  const out = await runLoop(co, cfg, { maxTicks, maxSteps: 30 });
  return `Ran ${out.ticks} tick(s). Stopped: ${out.stopped}\n\n${companyStatus(co)}`;
}

async function doChat(
  co: Company,
  cfg: AiCompanyOsConfig,
  message: string
): Promise<string> {
  const history: ChatMessage[] = co.chatHistory();
  const result = await chiefChat(co, cfg, history, message);
  const next: ChatMessage[] = [
    ...history,
    { role: "user", content: message },
    {
      role: "assistant",
      content: result.reply,
      ...(result.reasoning ? { reasoning: result.reasoning } : {}),
      ...(result.created.length
        ? { created: result.created.map((t) => ({ id: t.id, title: t.title })) }
        : {}),
    },
  ];
  co.saveChatHistory(next);
  let text = result.reply;
  if (result.created.length) {
    text +=
      "\n\nCreated: " +
      result.created.map((t) => `${t.id} ${t.title}`).join("; ");
  }
  return truncate(text, 3500);
}

function parseCommand(text: string): { cmd: string; arg: string } | null {
  const m = /^\/([a-zA-Z]+)(?:@\w+)?(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!m) return null;
  return { cmd: m[1].toLowerCase(), arg: (m[2] ?? "").trim() };
}

async function handleCallback(
  co: Company,
  cfg: AiCompanyOsConfig,
  token: string,
  update: TgUpdate
): Promise<boolean> {
  const cq = update.callback_query;
  if (!cq?.data || !cq.message) return false;
  const chatId = String(cq.message.chat.id);
  if (!isChatAllowed(co.meta.connectors!.telegram!, chatId)) {
    await tgAnswerCallback(token, cq.id, "Chat not allowed");
    return true;
  }

  const data = cq.data;
  const edit = { messageId: cq.message.message_id };
  const menu = () => mainMenuKeyboard(!!co.meta.paused);

  try {
    if (data === CB.menu) {
      await tgAnswerCallback(token, cq.id);
      await reply(token, chatId, welcomeText(co), menu(), edit);
      return true;
    }
    if (data === CB.status) {
      await tgAnswerCallback(token, cq.id, "Status");
      await reply(token, chatId, companyStatus(co), menu(), edit);
      return true;
    }
    if (data === CB.queue) {
      await tgAnswerCallback(token, cq.id);
      await reply(token, chatId, queueSummary(co), menu(), edit);
      return true;
    }
    if (data === CB.run) {
      await tgAnswerCallback(token, cq.id, "Running…");
      const text = await runTicks(co, cfg);
      await reply(token, chatId, text, menu());
      return true;
    }
    if (data === CB.pause) {
      const next = !co.meta.paused;
      co.saveMeta({ paused: next });
      await tgAnswerCallback(token, cq.id, next ? "Paused" : "Resumed");
      await reply(
        token,
        chatId,
        next ? "Company paused — no ticks until resumed." : "Company resumed.",
        mainMenuKeyboard(next),
        edit
      );
      return true;
    }
    if (data === CB.approvals) {
      await tgAnswerCallback(token, cq.id);
      const pending = listApprovals(co, "pending");
      if (!pending.length) {
        await reply(token, chatId, "No pending approvals.", menu(), edit);
      } else {
        const lines = pending.map(
          (a) =>
            `${a.id} · ${a.agent} · ${a.tool}\n  task ${a.taskId}\n  ${truncate(JSON.stringify(a.args), 120)}`
        );
        await reply(
          token,
          chatId,
          `Pending approvals (${pending.length}):\n\n${lines.join("\n\n")}`,
          approvalsKeyboard(pending),
          edit
        );
      }
      return true;
    }
    if (data === CB.help) {
      await tgAnswerCallback(token, cq.id);
      await reply(token, chatId, helpText(), menu(), edit);
      return true;
    }
    if (data === CB.chat) {
      await tgAnswerCallback(token, cq.id);
      await reply(
        token,
        chatId,
        "Send any message (or /chat …) to talk to the chief. History is shared with the dashboard.",
        menu(),
        edit
      );
      return true;
    }
    const approve = /^t:aa:(APR-\d+)$/.exec(data);
    if (approve) {
      decideApproval(co, approve[1], true, "via telegram");
      await tgAnswerCallback(token, cq.id, "Approved");
      await reply(token, chatId, `${approve[1]} approved — task re-queued.`, menu());
      return true;
    }
    const deny = /^t:ad:(APR-\d+)$/.exec(data);
    if (deny) {
      decideApproval(co, deny[1], false, "via telegram");
      await tgAnswerCallback(token, cq.id, "Denied");
      await reply(token, chatId, `${deny[1]} denied — task re-queued with refusal.`, menu());
      return true;
    }
    await tgAnswerCallback(token, cq.id, "Unknown action");
  } catch (e) {
    await tgAnswerCallback(token, cq.id, "Error");
    await reply(token, chatId, `Error: ${(e as Error).message}`, menu());
  }
  return true;
}

async function handleMessage(
  co: Company,
  cfg: AiCompanyOsConfig,
  tgCfg: TelegramConnectorConfig,
  token: string,
  update: TgUpdate
): Promise<boolean> {
  const msg = update.message;
  if (!msg) return false;
  const chatId = String(msg.chat.id);
  if (!isChatAllowed(tgCfg, chatId)) return true;
  const text = (msg.text || msg.caption || "").trim();
  if (!text) return true;

  const menu = () => mainMenuKeyboard(!!co.meta.paused);
  const who =
    msg.from?.username ||
    msg.from?.first_name ||
    msg.chat.username ||
    msg.chat.title ||
    chatId;

  const mode = tgCfg.mode ?? "bot";
  const parsed = parseCommand(text);

  // Legacy task mode: every non-command message (and /task) → INBOX
  if (mode === "task" && (!parsed || parsed.cmd === "task")) {
    const bodyText = parsed?.cmd === "task" ? parsed.arg || text : text;
    if (!bodyText.trim()) return true;
    ingestInbound(
      co,
      {
        channel: "telegram",
        from: `telegram:${chatId}`,
        subject: `tg from ${who}`,
        body: truncate(
          [`Chat id: ${chatId}`, `From: ${who}`, `Message id: ${msg.message_id}`, "", bodyText].join(
            "\n"
          ),
          4000
        ),
        externalId: `update-${update.update_id}`,
        createTask: true,
      },
      tgCfg.routeTo
    );
    await reply(token, chatId, "Received — created INBOX note + task.", menu());
    return true;
  }

  try {
    if (parsed) {
      const { cmd, arg } = parsed;
      if (cmd === "start" || cmd === "menu") {
        await reply(token, chatId, welcomeText(co), menu());
        return true;
      }
      if (cmd === "help") {
        await reply(token, chatId, helpText(), menu());
        return true;
      }
      if (cmd === "status") {
        await reply(token, chatId, companyStatus(co), menu());
        return true;
      }
      if (cmd === "queue") {
        await reply(token, chatId, queueSummary(co), menu());
        return true;
      }
      if (cmd === "run") {
        const n = Math.min(20, Math.max(1, Number(arg) || 5));
        const textOut = await runTicks(co, cfg, n);
        await reply(token, chatId, textOut, menu());
        return true;
      }
      if (cmd === "pause") {
        co.saveMeta({ paused: true });
        await reply(token, chatId, "Company paused.", mainMenuKeyboard(true));
        return true;
      }
      if (cmd === "resume") {
        co.saveMeta({ paused: false });
        await reply(token, chatId, "Company resumed.", mainMenuKeyboard(false));
        return true;
      }
      if (cmd === "approvals") {
        const pending = listApprovals(co, "pending");
        if (!pending.length) {
          await reply(token, chatId, "No pending approvals.", menu());
        } else {
          const lines = pending.map(
            (a) => `${a.id} · ${a.agent} wants ${a.tool} on ${a.taskId}`
          );
          await reply(
            token,
            chatId,
            `Pending (${pending.length}):\n${lines.join("\n")}`,
            approvalsKeyboard(pending)
          );
        }
        return true;
      }
      if (cmd === "chat") {
        if (!arg) {
          await reply(token, chatId, "Usage: /chat <message>", menu());
          return true;
        }
        await reply(token, chatId, "Thinking…");
        const out = await doChat(co, cfg, arg);
        await reply(token, chatId, out, menu());
        return true;
      }
      if (cmd === "task") {
        if (!arg) {
          await reply(token, chatId, "Usage: /task <text>", menu());
          return true;
        }
        ingestInbound(
          co,
          {
            channel: "telegram",
            from: `telegram:${chatId}`,
            subject: `tg from ${who}`,
            body: truncate(
              [`Chat id: ${chatId}`, `From: ${who}`, "", arg].join("\n"),
              4000
            ),
            externalId: `update-${update.update_id}`,
            createTask: true,
          },
          tgCfg.routeTo
        );
        await reply(token, chatId, "Created INBOX note + high-priority task.", menu());
        return true;
      }
      // Unknown slash command — treat as chat
    }

    // Free text → chief chat
    await reply(token, chatId, "Thinking…");
    const out = await doChat(co, cfg, text);
    await reply(token, chatId, out, menu());
  } catch (e) {
    await reply(token, chatId, `Error: ${(e as Error).message}`, menu());
  }
  return true;
}

/**
 * Process one Telegram Update for interactive bot mode (or task-mode messages).
 * Returns true if the update was handled (caller should advance the offset).
 */
export async function handleTelegramUpdate(
  co: Company,
  tgCfg: TelegramConnectorConfig,
  update: TgUpdate,
  opts?: { config?: AiCompanyOsConfig; workspaceRoot?: string }
): Promise<boolean> {
  const token = telegramToken(tgCfg);
  const cfg =
    opts?.config ?? loadConfig(opts?.workspaceRoot ?? workspaceRootOf(co));

  if (update.callback_query) {
    if ((tgCfg.mode ?? "bot") === "task") {
      // ignore button presses in legacy mode
      if (update.callback_query.id) {
        await tgAnswerCallback(token, update.callback_query.id, "Bot mode disabled");
      }
      return true;
    }
    return handleCallback(co, cfg, token, update);
  }
  if (update.message) {
    return handleMessage(co, cfg, tgCfg, token, update);
  }
  return false;
}

/** Send the interactive control pad to a chat (setup / test). */
export async function sendTelegramMenu(
  co: Company,
  tgCfg: TelegramConnectorConfig,
  chatId: string
): Promise<string> {
  assertAllowedChat(tgCfg, chatId);
  const token = telegramToken(tgCfg);
  await tgSendMessage(token, {
    chatId,
    text: welcomeText(co),
    replyMarkup: mainMenuKeyboard(!!co.meta.paused),
  });
  return `sent menu to ${chatId}`;
}
