import fs from "node:fs";
import path from "node:path";
import { Company } from "../../core/store.js";
import { transcribeLocal } from "../../core/transcribe.js";
import { slugify } from "../../util.js";
import { json, readBody } from "../http.js";
import type { RouteHandler } from "./types.js";

/** /api/upload, /api/plan/upload, /api/transcribe — data file intake + local Whisper. */
export const handleUploadRoutes: RouteHandler = async ({ root, req, res, url }) => {
  if (req.method === "POST" && url.pathname === "/api/transcribe") {
    const body = await readBody(req);
    const b64 = String(body.audioBase64 ?? "");
    if (!b64) {
      json(res, { error: "missing audioBase64" }, 400);
      return true;
    }
    let buf: Buffer;
    try {
      buf = Buffer.from(b64, "base64");
    } catch {
      json(res, { error: "invalid base64 audio" }, 400);
      return true;
    }
    if (buf.length > 25_000_000) {
      json(res, { error: "audio too large (25MB max)" }, 400);
      return true;
    }
    if (buf.length < 64) {
      json(res, { error: "audio too short" }, 400);
      return true;
    }
    const mime = String(body.mimeType ?? "audio/webm").split(";")[0]!.trim() || "audio/webm";
    try {
      const { text, model } = await transcribeLocal({ audio: buf, mimeType: mime });
      json(res, { text, model });
    } catch (e) {
      json(res, { error: e instanceof Error ? e.message : String(e) }, 502);
    }
    return true;
  }

  // into a company (chief chat): saved to data/uploads/, parse-previewed
  if (req.method === "POST" && url.pathname === "/api/upload") {
    const body = await readBody(req);
    const co = Company.open(root, String(body.company ?? ""));
    const name = String(body.filename ?? "upload").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
    const dir = path.join(co.dir, "data", "uploads");
    fs.mkdirSync(dir, { recursive: true });
    const buf = Buffer.from(String(body.dataBase64 ?? ""), "base64");
    if (buf.length > 15_000_000) {
      json(res, { error: "file too large (15MB max)" }, 400);
      return true;
    }
    fs.writeFileSync(path.join(dir, name), buf);
    co.audit({ type: "upload.received", ok: true, detail: `data/uploads/${name} (${buf.length} B)` });
    let preview: { rows: number; withEmail: number; sample: string[] } | null = null;
    let parseError: string | null = null;
    try {
      const { parseBusinessFile } = await import("../../core/tools.js");
      const parsed = parseBusinessFile(buf.toString("utf8"), name);
      preview = {
        rows: parsed.length,
        withEmail: parsed.filter((b) => b.email).length,
        sample: parsed.slice(0, 3).map((b) => b.name),
      };
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e);
    }
    json(res, { ok: true, path: `data/uploads/${name}`, preview, parseError, bytes: buf.length });
    return true;
  }

  // into a plan draft: saved to plans/<slug>/uploads/, copied into the
  // company's data/uploads at launch
  if (req.method === "POST" && url.pathname === "/api/plan/upload") {
    const body = await readBody(req);
    const slug = slugify(String(body.slug ?? "")) || `plan-${Date.now()}`;
    const name = String(body.filename ?? "upload").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
    const dir = path.join(root, "plans", slug, "uploads");
    fs.mkdirSync(dir, { recursive: true });
    const buf = Buffer.from(String(body.dataBase64 ?? ""), "base64");
    if (buf.length > 15_000_000) {
      json(res, { error: "file too large (15MB max)" }, 400);
      return true;
    }
    fs.writeFileSync(path.join(dir, name), buf);
    let preview: { rows: number; withEmail: number } | null = null;
    let parseError: string | null = null;
    try {
      const { parseBusinessFile } = await import("../../core/tools.js");
      const parsed = parseBusinessFile(buf.toString("utf8"), name);
      preview = { rows: parsed.length, withEmail: parsed.filter((b) => b.email).length };
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e);
    }
    json(res, { ok: true, slug, path: `uploads/${name}`, preview, parseError, bytes: buf.length });
    return true;
  }

  return false;
};
