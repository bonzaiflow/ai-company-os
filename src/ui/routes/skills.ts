import {
  deleteSkill,
  deleteSkillFile,
  importSkillArchive,
  listSkills,
  readSkillFile,
  writeSkillFile,
} from "../../core/skills.js";
import { json, readBody } from "../http.js";
import type { RouteHandler } from "./types.js";

/** /api/skills* — skill library CRUD and zip upload. */
export const handleSkillsRoutes: RouteHandler = async ({ root, bundledSkillsDir, req, res, url }) => {
  if (req.method === "GET" && url.pathname === "/api/skills") {
    json(res, listSkills(root, bundledSkillsDir));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/skills/file") {
    try {
      const name = String(url.searchParams.get("name") ?? "");
      const file = String(url.searchParams.get("path") ?? "SKILL.md");
      json(res, readSkillFile(root, bundledSkillsDir, name, file));
    } catch (e) {
      json(res, { error: (e as Error).message }, 400);
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/skills/save") {
    const body = await readBody(req);
    try {
      const saved = writeSkillFile(
        root,
        bundledSkillsDir,
        String(body.name ?? ""),
        String(body.path ?? "SKILL.md"),
        String(body.content ?? "")
      );
      json(res, { ok: true, name: saved.name, path: saved.path });
    } catch (e) {
      json(res, { error: (e as Error).message }, 400);
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/skills/file/delete") {
    const body = await readBody(req);
    try {
      deleteSkillFile(root, String(body.name ?? ""), String(body.path ?? ""));
      json(res, { ok: true });
    } catch (e) {
      json(res, { error: (e as Error).message }, 400);
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/skills/delete") {
    const body = await readBody(req);
    try {
      deleteSkill(root, String(body.name ?? ""));
      json(res, { ok: true });
    } catch (e) {
      json(res, { error: (e as Error).message }, 400);
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/skills/upload") {
    const body = await readBody(req);
    try {
      const imported = importSkillArchive(
        root,
        String(body.filename ?? "upload.zip"),
        Buffer.from(String(body.dataBase64 ?? ""), "base64")
      );
      json(res, { ok: true, imported });
    } catch (e) {
      json(res, { error: (e as Error).message }, 400);
    }
    return true;
  }

  return false;
};
