#!/usr/bin/env node
/** Watch src/, rebuild with tsc, restart the UI server, and auto-reload the browser.
 * The UI serves the workspace it runs in: set AI_COMPANY_OS_WORKSPACE to point it at real
 * data (e.g. AI_COMPANY_OS_WORKSPACE=~/ai-company-os-workspace npm run dev:ui); default is the repo. */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = process.env.AI_COMPANY_OS_WORKSPACE
  ? path.resolve(process.env.AI_COMPANY_OS_WORKSPACE.replace(/^~/, process.env.HOME ?? "~"))
  : root;

function run(cmd, args, cwd = root) {
  const child = spawn(cmd, args, { cwd, stdio: "inherit" });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else if (code) process.exit(code);
  });
  return child;
}

const build = spawn("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
build.on("exit", (code) => {
  if (code) process.exit(code);
  const tsc = run("npx", ["tsc", "--watch", "--preserveWatchOutput"]);
  console.log(`[dev-ui] serving workspace: ${workspace}`);
  const ui = run(process.execPath, ["--watch", path.join(root, "dist/cli.js"), "ui", "--dev"], workspace);
  const stop = () => {
    tsc.kill("SIGTERM");
    ui.kill("SIGTERM");
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
});
