import type { Command } from "commander";
import { loadConfig } from "../config.js";
import { chiefChat } from "../core/chat.js";
import type { ChatMessage } from "../types.js";
import { c } from "../util.js";
import {
  companyOption,
  fail,
  openCompany,
  out,
  withJson,
  type CliCtx,
} from "./helpers.js";

export function registerChatCommands(program: Command, ctx: CliCtx): void {
  withJson(
    companyOption(
      program
        .command("chat")
        .description("send a message to the company chief (persists chat history)")
        .argument("<message...>", "message text")
        .option("--no-save", "do not persist the reply to chat history")
        .action(async (words: string[], opts) => {
          const message = words.join(" ").trim();
          if (!message) fail("message required");
          const co = openCompany(ctx, opts.company);
          const cfg = loadConfig(ctx.root);
          const history: ChatMessage[] = co.chatHistory();
          try {
            const result = await chiefChat(co, cfg, history, message);
            if (opts.save !== false) {
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
            }
            out(
              {
                ok: true,
                reply: result.reply,
                reasoning: result.reasoning,
                created: result.created.map((t) => ({ id: t.id, title: t.title, status: t.status })),
                lookups: result.lookups,
              },
              () => {
                console.log(c.bold("chief:"));
                console.log(result.reply);
                if (result.created.length) {
                  console.log(
                    c.dim(
                      `created tasks: ${result.created.map((t) => `${t.id}:${t.title}`).join(", ")}`
                    )
                  );
                }
              }
            );
          } catch (e) {
            fail((e as Error).message);
          }
        })
    )
  );
}
