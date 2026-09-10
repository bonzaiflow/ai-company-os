import type { ChatMessage, LLMProvider, LLMResult, StreamChunk } from "../../types.js";

export class OllamaProvider implements LLMProvider {
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
