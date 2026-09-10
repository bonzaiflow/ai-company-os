import type { ChatMessage, LLMProvider, LLMResult, StreamChunk } from "../../types.js";
import { reasoningFromDelta, readSseJson } from "../sse.js";

export class OpenRouterProvider implements LLMProvider {
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
