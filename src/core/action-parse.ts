import type { AgentAction, AiCompanyOsConfig } from "../types.js";
import { resolveLlm, resolveProvider } from "../llm/resolve.js";
import { extractJson } from "../util.js";
import { ACTION_SCHEMA } from "./prompts.js";
import type { Company } from "./store.js";
import type { Tool } from "./tools.js";

/** Parse a model reply into an action. If it isn't valid JSON and an
 * "execution" role model is configured, ask that (typically small, fast)
 * model to convert the raw text into one valid action object. */
export async function parseAction(
  co: Company,
  cfg: AiCompanyOsConfig,
  agent: string,
  taskId: string,
  raw: string,
  tools: Tool[]
): Promise<AgentAction> {
  try {
    return extractJson(raw) as AgentAction;
  } catch (err) {
    const fixerOpts = { role: "execution" as const, meta: co.meta };
    const r = resolveLlm(cfg, fixerOpts);
    if (r.source !== "company_roles" && r.source !== "workspace_roles") throw err;
    const fixer = resolveProvider(cfg, fixerOpts);
    const res = await fixer.chat(
      [
        {
          role: "system",
          content:
            "You convert an AI agent's raw reply into EXACTLY ONE valid JSON action object. " +
            'Fields: "thought" (string), "action" (one of "tool"|"delegate"|"message"|"complete"), ' +
            "plus the matching optional fields: tool+args, subtasks[{title,description,assignee}], to+content, or result.\n" +
            (tools.length
              ? "The ONLY valid tools (use their exact names and arg keys):\n" +
                tools.map((t) => `- ${t.doc}`).join("\n") +
                "\n"
              : "") +
            "Copy concrete values (SQL, urls, paths, text) from the reply into args verbatim — do not drop them. " +
            "Preserve the agent's intent faithfully. Output only the JSON object.",
        },
        { role: "user", content: raw },
      ],
      { schema: ACTION_SCHEMA, temperature: 0 }
    );
    co.addSpent(res.promptTokens + res.completionTokens, 0);
    const action = extractJson(res.content) as AgentAction;
    co.audit({
      type: "llm.repair",
      ok: true,
      agent,
      taskId,
      detail: `${fixer.name}/${fixer.model} recovered malformed action`,
    });
    return action;
  }
}
