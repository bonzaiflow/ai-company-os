import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { loadConfig } from "../config.js";
import { requeueStuckRunning } from "../core/runtime.js";
import { runDaemon } from "../core/scheduler.js";
import { Company } from "../core/store.js";
import { c } from "../util.js";
import { json } from "./http.js";
import { PAGE } from "./page.js";
import { handleCompanyRoutes } from "./routes/company.js";
import { handleConnectorsRoutes } from "./routes/connectors.js";
import { handleDbRoutes } from "./routes/db.js";
import { handleGovernanceRoutes } from "./routes/governance.js";
import { handlePlansRoutes } from "./routes/plans.js";
import { handleRunRoutes } from "./routes/run.js";
import { handleSkillsRoutes } from "./routes/skills.js";
import { handleUploadRoutes } from "./routes/uploads.js";
import { handleWorkspaceRoutes } from "./routes/workspace.js";

const require = createRequire(import.meta.url);

/** Browser builds served at /vendor/* (allowlisted only). */
function resolveVendor(name: string): string | null {
  try {
    if (name === "cytoscape.min.js") {
      return require.resolve("cytoscape/dist/cytoscape.min.js");
    }
    if (name === "cytoscape-dagre.js") {
      return require.resolve("cytoscape-dagre");
    }
  } catch {
    return null;
  }
  return null;
}

const LIVE_RELOAD = `<script>
(function () {
  var v;
  setInterval(function () {
    fetch("/api/dev/version")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (v === undefined) v = d.v;
        else if (d.v !== v) location.reload();
      })
      .catch(function () {});
  }, 1000);
})();
</script>`;

/** Dashboard server. GETs are pure reads of the workspace; POSTs cover the
 * interactive layer: planning (with drafts persisted under plans/), skills
 * management, chat with the chief, and role-default configuration. The
 * runtime itself still runs via `ai-company-os run`. */
export function serveUi(
  initialRoot: string,
  port: number,
  bundledSkillsDir: string,
  opts: { dev?: boolean; daemon?: boolean } = {}
): void {
  let root = path.resolve(initialRoot);
  const setRoot = (r: string) => {
    root = r;
  };
  const dev = opts.dev ?? false;
  const bootId = Date.now();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    try {
      // every view has a real path (deep-linkable, back/forward works):
      // /  /company/<slug>  /plan/new  /plan/<slug>  /skills  /skills/<name>
      if (
        req.method === "GET" &&
        (url.pathname === "/" || /^\/(company|plan|skills)(\/|$)/.test(url.pathname))
      ) {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(dev ? PAGE.replace("</body>", LIVE_RELOAD + "\n</body>") : PAGE);
        return;
      }

      if (req.method === "GET" && url.pathname.startsWith("/vendor/")) {
        const name = path.basename(url.pathname);
        const file = resolveVendor(name);
        if (!file || !fs.existsSync(file)) {
          res.writeHead(404, { "content-type": "text/plain" });
          res.end("not found");
          return;
        }
        res.writeHead(200, {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": dev ? "no-store" : "public, max-age=86400",
        });
        fs.createReadStream(file).pipe(res);
        return;
      }

      if (dev && req.method === "GET" && url.pathname === "/api/dev/version") {
        json(res, { v: bootId });
        return;
      }

      const ctx = { root, setRoot, bundledSkillsDir, req, res, url };
      if (await handleWorkspaceRoutes(ctx)) return;
      if (await handleCompanyRoutes(ctx)) return;
      if (await handleConnectorsRoutes(ctx)) return;
      if (await handleGovernanceRoutes(ctx)) return;
      if (await handleRunRoutes(ctx)) return;
      if (await handlePlansRoutes(ctx)) return;
      if (await handleUploadRoutes(ctx)) return;
      if (await handleDbRoutes(ctx)) return;
      if (await handleSkillsRoutes(ctx)) return;

      res.writeHead(404);
      res.end("not found");
    } catch (e) {
      json(res, { error: (e as Error).message }, 500);
    }
  });

  // boot health check: a broken tool or dead provider must be loud BEFORE
  // agents burn steps on it (dev mode skips it — restarts are constant)
  if (!dev) {
    void import("../core/doctor.js").then(async ({ runDoctor, formatDoctor }) => {
      try {
        const checks = await runDoctor(loadConfig(root));
        const bad = checks.filter((c) => c.level !== "ok");
        if (bad.length) console.log(c.yellow("doctor:\n") + formatDoctor(bad));
      } catch {}
    });
  }

  // recover tasks orphaned in "running" by a previous process being killed
  // (e.g. dev-mode restarts mid-tick) — nothing can be running at our boot
  for (const slug of Company.list(root)) {
    try {
      const n = requeueStuckRunning(Company.open(root, slug), 0);
      if (n) console.log(c.yellow(`recovered ${n} stuck running task(s) in ${slug}`));
    } catch {}
  }

  server.listen(port, () => {
    console.log(c.green(`AI Company OS dashboard → http://localhost:${port}`));
    console.log(c.dim("workspace: " + root));
    if (dev) console.log(c.dim("dev mode — server restarts on rebuild, browser reloads on restart"));
    console.log(c.dim("plan + chat run through your configured providers; `ai-company-os run` executes the queue"));
    if (opts.daemon) {
      console.log(c.green("perpetual mode: waking scheduled companies in this process"));
      void runDaemon(() => root, () => loadConfig(root), {
        intervalSec: 60,
        log: (l) => console.log(c.dim("[daemon] ") + l),
      });
    }
  });
}
