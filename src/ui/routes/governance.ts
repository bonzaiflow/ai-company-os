import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../../config.js";
import { listCheckins, runCheckin } from "../../core/checkin.js";
import { decideApproval, listApprovals } from "../../core/governance.js";
import { Company } from "../../core/store.js";
import { json, readBody } from "../http.js";
import type { RouteHandler } from "./types.js";

/** /api/approvals*, /api/checkin(s), /api/audit/* — governance & audit. */
export const handleGovernanceRoutes: RouteHandler = async ({ root, req, res, url }) => {
  if (req.method === "GET" && url.pathname === "/api/approvals") {
    const co = Company.open(root, url.searchParams.get("company") ?? "");
    json(res, listApprovals(co));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/approvals/decide") {
    const body = await readBody(req);
    const co = Company.open(root, String(body.company ?? ""));
    const a = decideApproval(co, String(body.id ?? ""), !!body.approve, body.note ? String(body.note) : undefined);
    json(res, { ok: true, status: a.status });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/checkins") {
    const co = Company.open(root, url.searchParams.get("company") ?? "");
    json(res, listCheckins(co).reverse());
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/checkin") {
    const body = await readBody(req);
    const co = Company.open(root, String(body.company ?? ""));
    const ci = await runCheckin(co, loadConfig(root));
    json(res, ci);
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/audit/export") {
    const co = Company.open(root, url.searchParams.get("company") ?? "");
    const file = path.join(co.dir, "audit.jsonl");
    res.writeHead(200, {
      "content-type": "application/x-ndjson",
      "content-disposition": `attachment; filename="${co.meta.slug}-audit.jsonl"`,
    });
    res.end(fs.existsSync(file) ? fs.readFileSync(file) : "");
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/audit/verify") {
    const co = Company.open(root, url.searchParams.get("company") ?? "");
    const bad = co.verifyAudit();
    json(res, { intact: !bad, problem: bad });
    return true;
  }

  return false;
};
