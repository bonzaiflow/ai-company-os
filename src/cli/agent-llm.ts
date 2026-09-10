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
}
