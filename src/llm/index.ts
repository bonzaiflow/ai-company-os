import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { promisify } from "node:util";
import type {
  ChatMessage,
  AiCompanyOsConfig,
  LLMProvider,
  LLMResult,
  ProviderConfig,
  StreamChunk,
} from "../types.js";

const execFileAsync = promisify(execFile);

/** Resolve a bare CLI name against common install locations — server
 * processes often run without a login-shell PATH (~/.local/bin etc.). */
export function resolveCliCommand(command: string): string {
  if (command.includes("/")) return command;
  for (const dir of [
    `${os.homedir()}/.local/bin`,
    "/usr/local/bin",
    "/opt/homebrew/bin",
  ]) {
    if (fs.existsSync(`${dir}/${command}`)) return `${dir}/${command}`;
  }
  return command; // hope PATH has it
}

async function* asSingleChunk(result: LLMResult): AsyncIterable<StreamChunk> {
  if (result.reasoning) yield { reasoning: result.reasoning };
  if (result.content) yield { content: result.content };
  yield {
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
  };
}

/** Prefer native streaming; otherwise emit the full chat result as one chunk. */
export async function* streamChat(
  provider: LLMProvider,
  messages: ChatMessage[],
  opts?: { schema?: object; temperature?: number }
): AsyncIterable<StreamChunk> {
  if (provider.chatStream) {
    yield* provider.chatStream(messages, opts);
    return;
  }
  yield* asSingleChunk(await provider.chat(messages, opts));
}

function reasoningFromDelta(delta: Record<string, unknown> | undefined): string {
  if (!delta) return "";
  const parts: string[] = [];
  if (typeof delta.reasoning === "string") parts.push(delta.reasoning);
  if (typeof delta.reasoning_content === "string") parts.push(delta.reasoning_content);
  const details = delta.reasoning_details;
  if (Array.isArray(details)) {
    for (const d of details) {
      if (!d || typeof d !== "object") continue;
      const obj = d as Record<string, unknown>;
      if (typeof obj.text === "string") parts.push(obj.text);
      else if (typeof obj.content === "string") parts.push(obj.content);
      else if (typeof obj.summary === "string") parts.push(obj.summary);
    }
  }
  return parts.join("");
}

async function* readSseJson(
  res: Response
): AsyncIterable<Record<string, unknown>> {
  if (!res.body) throw new Error("stream response has no body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        yield JSON.parse(data) as Record<string, unknown>;
      } catch {
        // ignore partial/malformed SSE lines
      }
    }
  }
}

class OllamaProvider implements LLMProvider {
  constructor(
    public name: string,
    private baseUrl: string,
    public model: string,
    private structured = true
  ) {}

  async chat(
    messages: ChatMessage[],
    opts?: { schema?: object; temperature?: number }
  ): Promise<LLMResult> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        format: this.structured ? opts?.schema : undefined,
        options: { temperature: opts?.temperature ?? 0.4, num_predict: 8192 },
      }),
    });
    if (!res.ok) {
      throw new Error(`ollama ${this.baseUrl}: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as {
      message: { content: string; thinking?: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };
    return {
      content: data.message.content,
      reasoning: data.message.thinking || undefined,
      promptTokens: data.prompt_eval_count ?? 0,
      completionTokens: data.eval_count ?? 0,
    };
  }

  async *chatStream(
    messages: ChatMessage[],
    opts?: { schema?: object; temperature?: number }
  ): AsyncIterable<StreamChunk> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: true,
        format: this.structured ? opts?.schema : undefined,
        options: { temperature: opts?.temperature ?? 0.4, num_predict: 8192 },
      }),
    });
    if (!res.ok) {
      throw new Error(`ollama ${this.baseUrl}: ${res.status} ${await res.text()}`);
    }
    if (!res.body) throw new Error("ollama stream has no body");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let promptTokens = 0;
    let completionTokens = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let data: {
          message?: { content?: string; thinking?: string };
          prompt_eval_count?: number;
          eval_count?: number;
          done?: boolean;
        };
        try {
          data = JSON.parse(trimmed);
        } catch {
          continue;
        }
        const chunk: StreamChunk = {};
        if (data.message?.thinking) chunk.reasoning = data.message.thinking;
        if (data.message?.content) chunk.content = data.message.content;
        if (data.prompt_eval_count != null) promptTokens = data.prompt_eval_count;
        if (data.eval_count != null) completionTokens = data.eval_count;
        if (chunk.content || chunk.reasoning) yield chunk;
        if (data.done) {
          yield { promptTokens, completionTokens };
        }
      }
    }
  }
}

class OpenRouterProvider implements LLMProvider {
  constructor(
    public name: string,
    private baseUrl: string,
    public model: string,
    private apiKey: string,
    private structured = true
  ) {}

  async chat(
    messages: ChatMessage[],
    opts?: { schema?: object; temperature?: number }
  ): Promise<LLMResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: opts?.temperature ?? 0.4,
    };
    if (opts?.schema && this.structured) {
      body.response_format = {
        type: "json_schema",
        json_schema: { name: "action", strict: false, schema: opts.schema },
      };
    }
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`openrouter: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as {
      choices: {
        message: {
          content: string;
          reasoning?: string;
          reasoning_content?: string;
          reasoning_details?: unknown[];
        };
      }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const msg = data.choices[0]?.message;
    const reasoning = reasoningFromDelta(msg as unknown as Record<string, unknown>);
    return {
      content: msg?.content ?? "",
      reasoning: reasoning || undefined,
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
    };
  }

  async *chatStream(
    messages: ChatMessage[],
    opts?: { schema?: object; temperature?: number }
  ): AsyncIterable<StreamChunk> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: opts?.temperature ?? 0.4,
      stream: true,
    };
    if (opts?.schema && this.structured) {
      body.response_format = {
        type: "json_schema",
        json_schema: { name: "action", strict: false, schema: opts.schema },
      };
    }
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`openrouter: ${res.status} ${await res.text()}`);
    }
    let promptTokens = 0;
    let completionTokens = 0;
    for await (const evt of readSseJson(res)) {
      const choices = evt.choices as { delta?: Record<string, unknown> }[] | undefined;
      const delta = choices?.[0]?.delta;
      const chunk: StreamChunk = {};
      const reasoning = reasoningFromDelta(delta);
      if (reasoning) chunk.reasoning = reasoning;
      if (typeof delta?.content === "string" && delta.content) chunk.content = delta.content;
      const usage = evt.usage as
        | { prompt_tokens?: number; completion_tokens?: number }
        | undefined;
      if (usage?.prompt_tokens != null) promptTokens = usage.prompt_tokens;
      if (usage?.completion_tokens != null) completionTokens = usage.completion_tokens;
      if (chunk.content || chunk.reasoning) yield chunk;
    }
    if (promptTokens || completionTokens) {
      yield { promptTokens, completionTokens };
    }
  }
}

/** Cursor CLI as an LLM: shells out to `cursor-agent -p` in read-only ask
 * mode, so it behaves as a pure model (no file edits, no shell) with access
 * to whatever models the Cursor account has ("auto" by default). No native
 * structured outputs — the JSON schema is embedded in the prompt and the
 * runtime's lenient parse + repair pass handles the rest. */
class CursorProvider implements LLMProvider {
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

/** Claude Code CLI as an LLM: shells out to `claude -p` with tools DISABLED
 * (`--tools ""`), so it behaves as a pure text model — no file or shell access,
 * the analog of cursor's ask mode. No native structured outputs, so the JSON
 * schema goes in the prompt and the runtime's lenient parse + repair covers it. */
class ClaudeProvider implements LLMProvider {
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

/** Replays canned responses from a JSON file (array of strings). Used by the
 * smoke test so the whole engine can run without any model. */
class MockProvider implements LLMProvider {
  public model = "mock";
  private responses: string[];
  private cursorFile: string;

  constructor(public name: string, script: string) {
    this.responses = JSON.parse(fs.readFileSync(script, "utf8"));
    this.cursorFile = script + ".cursor";
  }

  async chat(): Promise<LLMResult> {
    let i = 0;
    try {
      i = Number(fs.readFileSync(this.cursorFile, "utf8"));
    } catch {}
    if (i >= this.responses.length) throw new Error("mock script exhausted");
    fs.writeFileSync(this.cursorFile, String(i + 1));
    return { content: this.responses[i], promptTokens: 100, completionTokens: 50 };
  }

  async *chatStream(): AsyncIterable<StreamChunk> {
    const res = await this.chat();
    // simulate token streaming for UI tests
    const text = res.content;
    const step = Math.max(8, Math.ceil(text.length / 24));
    for (let i = 0; i < text.length; i += step) {
      yield { content: text.slice(i, i + step) };
    }
    yield { promptTokens: res.promptTokens, completionTokens: res.completionTokens };
  }
}

export function createProvider(
  cfg: AiCompanyOsConfig,
  name?: string,
  modelOverride?: string
): LLMProvider {
  const key = name ?? cfg.defaultProvider;
  const pc: ProviderConfig | undefined = cfg.providers[key];
  if (!pc) throw new Error(`unknown provider "${key}" (check ai-company-os.json)`);
  const model = modelOverride ?? pc.model ?? "";
  switch (pc.type) {
    case "ollama":
      return new OllamaProvider(
        key,
        pc.baseUrl ?? "http://localhost:11434",
        model,
        pc.structured !== false
      );
    case "openrouter": {
      const envVar = pc.apiKeyEnv ?? "OPENROUTER_API_KEY";
      const apiKey = process.env[envVar];
      if (!apiKey) throw new Error(`env var ${envVar} not set for provider "${key}"`);
      return new OpenRouterProvider(
        key,
        pc.baseUrl ?? "https://openrouter.ai/api/v1",
        model,
        apiKey,
        pc.structured !== false
      );
    }
    case "cursor":
      return new CursorProvider(key, model || "auto", pc.command ?? "cursor-agent");
    case "claude":
      return new ClaudeProvider(key, model || "sonnet", pc.command ?? "claude");
    case "mock":
      if (!pc.script) throw new Error(`mock provider "${key}" needs a script path`);
      return new MockProvider(key, pc.script);
  }
}
