import fs from "node:fs";
import type { LLMProvider, LLMResult, StreamChunk } from "../../types.js";

/** Replays canned responses from a JSON file (array of strings). Used by the
 * smoke test so the whole engine can run without any model. */
export class MockProvider implements LLMProvider {
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
