import type {
  ChatMessage,
  AiCompanyOsConfig,
  LLMProvider,
  LLMResult,
  ProviderConfig,
  StreamChunk,
} from "../types.js";
import { ClaudeProvider } from "./providers/claude.js";
import { CursorProvider } from "./providers/cursor.js";
import { MockProvider } from "./providers/mock.js";
import { OllamaProvider } from "./providers/ollama.js";
import { OpenRouterProvider } from "./providers/openrouter.js";

export { resolveCliCommand } from "./cli-path.js";

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
