import type { Command } from "commander";
import { loadConfig, saveRoles } from "../config.js";
import { skillNames } from "../core/skills.js";
import { c } from "../util.js";
import { fail, out, withJson, type CliCtx } from "./helpers.js";

export function registerConfigCommands(program: Command, ctx: CliCtx): void {
  const config = program.command("config").description("workspace providers, roles, and models");

  withJson(
    config
      .command("get")
      .description("show effective config (providers / roles / models / skills)")
      .action(() => {
        const cfg = loadConfig(ctx.root);
        const payload = {
          root: ctx.root,
          providers: Object.keys(cfg.providers).filter((p) => cfg.providers[p].type !== "mock"),
          defaultProvider: cfg.defaultProvider,
          roles: cfg.roles ?? {},
          models: cfg.models ?? {},
          skills: skillNames(ctx.root, ctx.bundledSkills),
          providerDetails: Object.fromEntries(
            Object.entries(cfg.providers)
              .filter(([, p]) => p.type !== "mock")
              .map(([name, p]) => [
                name,
                { type: p.type, model: p.model, baseUrl: p.baseUrl, apiKeyEnv: p.apiKeyEnv },
              ])
          ),
        };
        out(payload, () => console.log(JSON.stringify(payload, null, 2)));
      })
  );

  withJson(
    config
      .command("set")
      .description("set role→provider and/or role→model overrides in project config")
      .option("--role <map...>", "role=provider pairs (e.g. planning=ollama-local agents=cursor)")
      .option("--model <map...>", "role=model pairs (e.g. planning=gemma4:12b)")
      .action((opts) => {
        const roles: Record<string, string> = {};
        const models: Record<string, string> = {};
        for (const raw of (opts.role as string[] | undefined) ?? []) {
          const i = raw.indexOf("=");
          if (i < 1) fail(`bad --role ${raw} (want role=provider)`);
          roles[raw.slice(0, i)] = raw.slice(i + 1);
        }
        for (const raw of (opts.model as string[] | undefined) ?? []) {
          const i = raw.indexOf("=");
          if (i < 1) fail(`bad --model ${raw} (want role=model)`);
          models[raw.slice(0, i)] = raw.slice(i + 1);
        }
        if (!Object.keys(roles).length && !Object.keys(models).length) {
          fail("provide at least one --role or --model");
        }
        saveRoles(ctx.root, roles, models);
        out({ ok: true, roles, models }, () => {
          console.log(c.green("config updated"));
          if (Object.keys(roles).length) console.log("roles:", roles);
          if (Object.keys(models).length) console.log("models:", models);
        });
      })
  );

  withJson(
    config
      .command("models")
      .description("list models available from a provider")
      .argument("<provider>", "provider name from ai-company-os.json")
      .action(async (providerName: string) => {
        const cfg = loadConfig(ctx.root);
        const pc = cfg.providers[providerName];
        if (!pc) fail(`unknown provider "${providerName}"`);
        const fallback = pc.model ? [pc.model] : [];
        try {
          if (pc.type === "ollama") {
            const r = await fetch(`${pc.baseUrl ?? "http://localhost:11434"}/api/tags`, {
              signal: AbortSignal.timeout(4000),
            });
            const data = (await r.json()) as { models: { name: string }[] };
            const names = data.models.map((m) => m.name).sort();
            out(
              { models: names.length ? names : fallback, default: pc.model },
              () => console.log((names.length ? names : fallback).join("\n"))
            );
            return;
          }
          if (pc.type === "cursor") {
            const { execFileSync } = await import("node:child_process");
            try {
              const outTxt = execFileSync(pc.command ?? "cursor-agent", ["--list-models"], {
                encoding: "utf8",
                timeout: 8000,
              });
              const models = outTxt
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean);
              out(
                { models: models.length ? models : ["auto"], default: pc.model ?? "auto" },
                () => console.log((models.length ? models : ["auto"]).join("\n"))
              );
            } catch {
              out({ models: ["auto"], default: pc.model ?? "auto" }, () => console.log("auto"));
            }
            return;
          }
          if (pc.type === "claude") {
            const models = [
              "sonnet",
              "opus",
              "haiku",
              "claude-opus-4-8",
              "claude-sonnet-5",
              "claude-haiku-4-5",
            ];
            out({ models, default: pc.model ?? "sonnet" }, () => console.log(models.join("\n")));
            return;
          }
          if (pc.type === "openrouter") {
            const r = await fetch(`${pc.baseUrl ?? "https://openrouter.ai/api/v1"}/models`, {
              signal: AbortSignal.timeout(6000),
            });
            const data = (await r.json()) as { data: { id: string }[] };
            const ids = data.data.map((m) => m.id);
            const free = ids.filter((i) => i.endsWith(":free")).sort();
            const paid = ids.filter((i) => !i.endsWith(":free")).sort();
            const models = [...free, ...paid].slice(0, 300);
            out({ models, default: pc.model }, () => console.log(models.join("\n")));
            return;
          }
        } catch {
          /* fall through */
        }
        out({ models: fallback, default: pc.model }, () => console.log(fallback.join("\n") || "(none)"));
      })
  );
}
