import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../../config.js";
import { skillNames, skillSearchDirs } from "../../core/skills.js";
import { scaffoldCompany } from "../../core/store.js";
import { resolveProvider } from "../../llm/resolve.js";
import { normalizePlan, planTurn, plannerSystem } from "../../planner.js";
import type { ChatMessage, Plan } from "../../types.js";
import { readJson, slugify, writeJson } from "../../util.js";
import { json, readBody } from "../http.js";
import { deletePlanFiles, planChatFile, planFile } from "../plans.js";
import type { RouteHandler } from "./types.js";

/** /api/plans, /api/plan, /api/plan/chat|delete|launch — planning phase. */
export const handlePlansRoutes: RouteHandler = async ({ root, bundledSkillsDir, req, res, url }) => {
  if (req.method === "GET" && url.pathname === "/api/plans") {
    const dir = path.join(root, "plans");
    const out: unknown[] = [];
    const seen = new Set<string>();
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        let slug: string | null = null;
        if (f.isDirectory() && fs.existsSync(path.join(dir, f.name, "plan.json"))) {
          slug = f.name;
        } else if (f.isFile() && f.name.endsWith(".json") && !f.name.endsWith(".chat.json")) {
          slug = f.name.replace(/\.json$/, "");
        }
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);
        const plan = readJson<Plan | null>(planFile(root, slug), null);
        if (plan) {
          out.push({ slug, name: plan.name, goal: plan.goal, agents: plan.agents?.length ?? 0 });
        }
      }
    }
    json(res, out);
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/plan") {
    const slug = url.searchParams.get("slug") ?? "";
    json(res, {
      plan: readJson<Plan | null>(planFile(root, slug), null),
      history: readJson<ChatMessage[]>(planChatFile(root, slug), []),
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/plan/chat") {
    const body = await readBody(req);
    const cfg = loadConfig(root);
    const provider = resolveProvider(cfg, {
      role: "planning",
      request: {
        provider: body.provider || undefined,
        model: body.model || undefined,
      },
    });
    const history: ChatMessage[] = Array.isArray(body.history) ? body.history : [];
    // the planner should know about data the owner already uploaded
    let uploadsNote = "";
    const upDir = body.slug ? path.join(root, "plans", String(body.slug), "uploads") : "";
    if (upDir && fs.existsSync(upDir)) {
      const files = fs.readdirSync(upDir);
      if (files.length) {
        uploadsNote =
          `\n\nThe owner has ALREADY uploaded data files that will be available to the company at ` +
          `data/uploads/: ${files.join(", ")}. Plan around this: agents can import them with the ` +
          `importdata tool instead of re-discovering from scratch.`;
      }
    }
    const turn = await planTurn(provider, [
      { role: "system", content: plannerSystem(skillNames(root, bundledSkillsDir)) + uploadsNote },
      ...history.slice(-16),
    ]);

    // persist the draft in its own shareable folder (migrates legacy flat files)
    const slug = body.slug || slugify(turn.plan.name);
    fs.rmSync(path.join(root, "plans", `${slug}.json`), { force: true });
    fs.rmSync(path.join(root, "plans", `${slug}.chat.json`), { force: true });
    writeJson(path.join(root, "plans", slug, "plan.json"), turn.plan);
    writeJson(path.join(root, "plans", slug, "chat.json"), [
      ...history,
      { role: "assistant", content: JSON.stringify(turn) },
    ]);
    json(res, { ...turn, slug });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/plan/delete") {
    const body = await readBody(req);
    deletePlanFiles(root, slugify(String(body.slug ?? "")));
    json(res, { ok: true });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/plan/launch") {
    const body = await readBody(req);
    const cfg = loadConfig(root);
    const plan = normalizePlan(body.plan as Plan);
    if (body.name) plan.name = String(body.name);
    const planSlug = body.slug ? String(body.slug) : slugify(plan.name);
    const planningHistory = readJson<ChatMessage[]>(planChatFile(root, planSlug), []);
    const launchProvider =
      body.provider ||
      cfg.roles?.agents ||
      cfg.defaultProvider;
    const launchModel =
      body.model ||
      cfg.models?.agents ||
      undefined;
    const co = scaffoldCompany(
      root,
      plan,
      skillSearchDirs(root, bundledSkillsDir),
      launchProvider,
      launchModel
    );
    if (Array.isArray(planningHistory) && planningHistory.length) {
      co.savePlanningChat(planningHistory);
    }
    // carry plan-phase uploads into the company so agents can importdata them
    const planUploads = path.join(root, "plans", planSlug, "uploads");
    if (fs.existsSync(planUploads)) {
      const dest = path.join(co.dir, "data", "uploads");
      fs.mkdirSync(dest, { recursive: true });
      for (const f of fs.readdirSync(planUploads)) {
        fs.copyFileSync(path.join(planUploads, f), path.join(dest, f));
      }
      co.audit({ type: "upload.received", ok: true, detail: `from plan: ${fs.readdirSync(planUploads).join(", ")}` });
    }
    deletePlanFiles(root, planSlug);
    json(res, { slug: co.meta.slug, name: co.meta.name });
    return true;
  }

  return false;
};
