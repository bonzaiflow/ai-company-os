export function reasoningFromDelta(delta: Record<string, unknown> | undefined): string {
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

export async function* readSseJson(
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
