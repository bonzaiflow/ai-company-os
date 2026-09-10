import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import type { ChatMessage, LLMProvider, LLMResult } from "../../types.js";
import { resolveCliCommand } from "../cli-path.js";

const execFileAsync = promisify(execFile);

/** Claude Code CLI as an LLM: shells out to `claude -p` with tools DISABLED
 * (`--tools ""`), so it behaves as a pure text model — no file or shell access,
 * the analog of cursor's ask mode. No native structured outputs, so the JSON
 * schema goes in the prompt and the runtime's lenient parse + repair covers it. */
export class ClaudeProvider implements LLMProvider {
  constructor(
    public name: string,
    public model: string,
    private command: string
  ) {}

  async chat(
    messages: ChatMessage[],
    opts?: { schema?: object; temperature?: number }
  ): Promise<LLMResult> {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const rest = messages
      .filter((m) => m.role !== "system")
      .map((m) => `[${m.role}]\n${m.content}`);
    if (opts?.schema) {
      rest.push(
        "[format]\nAnswer with ONLY one JSON object (no prose, no code fences) matching this JSON schema:\n" +
          JSON.stringify(opts.schema)
      );
    }
    const prompt = rest.join("\n\n");
    const args = [
      "-p",
      "--tools", "", // pure LLM: no tools, no file/shell access
      "--no-session-persistence",
      "--output-format", "text",
      "--model", this.model,
    ];
    if (system) args.push("--append-system-prompt", system);
    args.push(prompt);
    let stdout = "";
    try {
      const child = execFileAsync(resolveCliCommand(this.command), args, {
        cwd: os.tmpdir(),
        timeout: 600_000,
        maxBuffer: 16 * 1024 * 1024,
      });
      child.child.stdin?.end(); // claude -p waits on stdin otherwise (3s stall)
      stdout = (await child).stdout;
    } catch (e) {
      const out = String((e as { stdout?: string }).stdout ?? "");
      if (/not logged in|\/login/i.test(out)) {
        throw new Error(
          "claude CLI is not logged in — run `claude` once in a terminal and use /login, then retry."
        );
      }
      throw new Error(`claude CLI failed: ${out.slice(0, 200) || (e as Error).message}`);
    }
    const content = stdout.trim();
    // the CLI reports no token usage in text mode — approximate for the countdown
    return {
      content,
      promptTokens: Math.ceil((system.length + prompt.length) / 4),
      completionTokens: Math.ceil(content.length / 4),
    };
  }
}
