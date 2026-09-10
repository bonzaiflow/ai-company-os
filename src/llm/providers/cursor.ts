import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import type { ChatMessage, LLMProvider, LLMResult } from "../../types.js";
import { resolveCliCommand } from "../cli-path.js";

const execFileAsync = promisify(execFile);

/** Cursor CLI as an LLM: shells out to `cursor-agent -p` in read-only ask
 * mode, so it behaves as a pure model (no file edits, no shell) with access
 * to whatever models the Cursor account has ("auto" by default). No native
 * structured outputs — the JSON schema is embedded in the prompt and the
 * runtime's lenient parse + repair pass handles the rest. */
export class CursorProvider implements LLMProvider {
  constructor(
    public name: string,
    public model: string,
    private command: string
  ) {}

  async chat(
    messages: ChatMessage[],
    opts?: { schema?: object; temperature?: number }
  ): Promise<LLMResult> {
    const parts = messages.map((m) =>
      m.role === "system" ? m.content : `[${m.role}]\n${m.content}`
    );
    if (opts?.schema) {
      parts.push(
        "[format]\nAnswer with ONLY one JSON object (no prose, no code fences) matching this JSON schema:\n" +
          JSON.stringify(opts.schema)
      );
    }
    const prompt = parts.join("\n\n");
    const { stdout } = await execFileAsync(
      resolveCliCommand(this.command),
      ["-p", "--trust", "--mode", "ask", "--output-format", "text", "--model", this.model, prompt],
      { cwd: os.tmpdir(), timeout: 600_000, maxBuffer: 16 * 1024 * 1024 }
    );
    const content = stdout.trim();
    // the CLI reports no token usage — approximate for the budget countdown
    return {
      content,
      promptTokens: Math.ceil(prompt.length / 4),
      completionTokens: Math.ceil(content.length / 4),
    };
  }
}
