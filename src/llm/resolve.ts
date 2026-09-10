import type { AgentSpec, AiCompanyOsConfig, CompanyMeta, LLMProvider, RoleDefaults } from "../types.js";
import type { Company } from "../core/store.js";
import { createProvider } from "./index.js";

export type LlmRole = keyof RoleDefaults; // planning | agents | execution

export type LlmResolutionSource =
  | "request"
  | "agent"
  | "company_roles"
  | "workspace_roles"
  | "company"
  | "default";

export interface LlmResolution {
  provider: string;
  model?: string;
  /** Where the provider name came from. */
  source: LlmResolutionSource;
}

export interface ResolveLlmOpts {
  role: LlmRole;
  /** Company meta; omit for workspace-only roles (e.g. planning before launch). */
  meta?: CompanyMeta | null;
  /** Agent profile overrides (agents / chief chat). */
  agent?: Pick<AgentSpec, "provider" | "model"> | null;
  /** One-shot CLI/API override (provider and/or model). */
  request?: { provider?: string; model?: string } | null;
}

/**
 * Resolve which provider+model to use for a role.
 *
 * Precedence (unchanged product default):
 * request.provider → agent profile → company meta.roles[role] →
 * workspace roles[role] → company meta.provider → defaultProvider
 *
 * Model: request.model → (same tier as provider when agent) → company/workspace models[role] → company.model
 */
export function resolveLlm(cfg: AiCompanyOsConfig, opts: ResolveLlmOpts): LlmResolution {
  const role = opts.role;
  const meta = opts.meta ?? null;
  const agent = opts.agent ?? null;
  const req = opts.request ?? null;

  let provider: string;
  let source: LlmResolutionSource;
  let model: string | undefined;

  if (req?.provider) {
    provider = req.provider;
    source = "request";
    model = req.model || undefined;
  } else if (agent?.provider) {
    provider = agent.provider;
    source = "agent";
    model = agent.model || meta?.models?.[role] || cfg.models?.[role] || meta?.model || undefined;
  } else if (meta?.roles?.[role]) {
    provider = meta.roles[role]!;
    source = "company_roles";
    model = meta.models?.[role] || cfg.models?.[role] || meta.model || undefined;
  } else if (cfg.roles?.[role]) {
    provider = cfg.roles[role]!;
    source = "workspace_roles";
    model = cfg.models?.[role] || meta?.model || undefined;
  } else if (meta?.provider) {
    provider = meta.provider;
    source = "company";
    model = meta.model || cfg.models?.[role] || undefined;
  } else {
    provider = cfg.defaultProvider;
    source = "default";
    model = cfg.models?.[role] || undefined;
  }

  // Model-only request override (keep inherited provider)
  if (!req?.provider && req?.model) {
    model = req.model;
  }

  return { provider, model, source };
}

/** Resolve and instantiate a provider. */
export function resolveProvider(cfg: AiCompanyOsConfig, opts: ResolveLlmOpts): LLMProvider {
  const r = resolveLlm(cfg, opts);
  return createProvider(cfg, r.provider, r.model || undefined);
}

/** Prefer execution role for structured helpers; else agents; else company default. */
export function resolveHelperLlm(
  cfg: AiCompanyOsConfig,
  meta: CompanyMeta | null | undefined
): LlmResolution & { roleKind: "execution" | "agents" | "default" } {
  const exec = resolveLlm(cfg, { role: "execution", meta });
  if (exec.source === "company_roles" || exec.source === "workspace_roles") {
    return { ...exec, roleKind: "execution" };
  }
  const agents = resolveLlm(cfg, { role: "agents", meta });
  if (agents.source === "company_roles" || agents.source === "workspace_roles") {
    return { ...agents, roleKind: "agents" };
  }
  return { ...agents, roleKind: "default" };
}
