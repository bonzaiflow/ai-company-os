import type { Command } from "commander";
import { loadConfig } from "../config.js";
import { effectiveAgentLlm } from "../llm/resolve.js";
import { c } from "../util.js";
import {
  companyOption,
  fail,
  openCompany,
  out,
  withJson,
  type CliCtx,
} from "./helpers.js";

export function registerAgentLlmCommands(program: Command, ctx: CliCtx): void {
  withJson(
    companyOption(
      program
        .command("set-llm")
        .description("set or clear an agent's LLM source (provider+model on profile.md)")
        .argument("<name>", "agent name")
        .option("-p, --provider <name>", "provider from ai-company-os.json (e.g. claude, cursor, openrouter)")
        .option("-m, --model <model>", "model id/alias for that provider")
        .option("--clear", "remove provider/model override (inherit company/workspace default)")
        .action((name: string, opts) => {
          const co = openCompany(ctx, opts.company);
          const cfg = loadConfig(ctx.root);
          let agent;
          try {
            agent = co.loadAgent(name);
          } catch {
            fail(`no agent named ${name}`);
          }
          if (opts.clear) {
            agent.provider = undefined;
            agent.model = undefined;
          } else {
            if (!opts.provider && !opts.model) {
              fail("pass -p/--provider and/or -m/--model, or --clear");
            }
            if (opts.provider) {
              if (!cfg.providers[opts.provider]) {
                fail(`unknown provider "${opts.provider}" (check ai-company-os.json)`);
              }
              agent.provider = String(opts.provider);
            }
            if (opts.model !== undefined) agent.model = String(opts.model);
          }
          co.saveAgent(agent);
          const llm = effectiveAgentLlm(cfg, co.meta, agent);
          out(
            { ok: true, agent: agent.name, llm },
            () => {
              if (opts.clear) {
                console.log(c.green(`${name}: cleared LLM override → inherits ${llm.provider}${llm.model ? "/" + llm.model : ""} (${llm.source})`));
              } else {
                console.log(
                  c.green(
                    `${name}: ${llm.provider}${llm.model ? "/" + llm.model : ""} (${llm.source})`
                  )
                );
              }
            }
          );
        })
    )
  );

  withJson(
    companyOption(
      program
        .command("set-runtime")
        .description("make an agent internal, external (pull or push) or manual — see docs/AGENT-CONTRACT.md")
        .argument("<name>", "agent name")
        .option("-r, --runtime <runtime>", "internal | external | manual")
        .option("-a, --adapter <name>", "push launcher from agentRuntimes (codex, claude-code, cursor, …); empty = pull")
        .option("--cwd <dir>", "run directory for push runs (must be under allowedCwds)")
        .option("--lease-minutes <n>")
        .option("--max-tasks-per-day <n>")
        .option("--max-minutes-per-task <n>")
        .option("--approve-results <bool>", "true = owner reviews results before done")
        .option("--tool-mode <mode>", "native | company")
        .action((name: string, opts) => {
          const co = openCompany(ctx, opts.company);
          const cfg = loadConfig(ctx.root);
          let agent;
          try {
            agent = co.loadAgent(name);
          } catch {
            fail(`no agent named ${name}`);
          }
          if (opts.runtime !== undefined) {
            if (!["internal", "external", "manual"].includes(opts.runtime)) fail("runtime must be internal, external or manual");
            agent.runtime = opts.runtime === "internal" ? undefined : opts.runtime;
          }
          if (opts.adapter !== undefined) {
            if (opts.adapter && !cfg.agentRuntimes?.[opts.adapter]) {
              fail(`unknown adapter "${opts.adapter}" (have: ${Object.keys(cfg.agentRuntimes ?? {}).join(", ")})`);
            }
            agent.adapter = opts.adapter || undefined;
          }
          const num = (v: string | undefined, cur: number | undefined) => (v === undefined ? cur : Number(v) || undefined);
          if (opts.cwd !== undefined) agent.cwd = opts.cwd || undefined;
          agent.leaseMinutes = num(opts.leaseMinutes, agent.leaseMinutes);
          agent.maxTasksPerDay = num(opts.maxTasksPerDay, agent.maxTasksPerDay);
          agent.maxMinutesPerTask = num(opts.maxMinutesPerTask, agent.maxMinutesPerTask);
          if (opts.approveResults !== undefined) agent.approveResults = opts.approveResults === "true" || undefined;
          if (opts.toolMode !== undefined) {
            if (opts.toolMode && !["native", "company"].includes(opts.toolMode)) fail("tool mode must be native or company");
            agent.toolMode = opts.toolMode || undefined;
          }
          if (agent.runtime !== "external") agent.adapter = undefined;
          co.saveAgent(agent);
          const mode = !agent.runtime ? "internal" : agent.runtime === "manual" ? "manual" : agent.adapter ? `external push (${agent.adapter})` : "external pull";
          out({ ok: true, agent: agent.name, runtime: agent.runtime ?? "internal", adapter: agent.adapter, mode }, () =>
            console.log(c.green(`${name}: ${mode}`))
          );
        })
    )
  );
}
