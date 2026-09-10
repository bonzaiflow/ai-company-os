import fs from "node:fs";
import os from "node:os";

/** Resolve a bare CLI name against common install locations — server
 * processes often run without a login-shell PATH (~/.local/bin etc.). */
export function resolveCliCommand(command: string): string {
  if (command.includes("/")) return command;
  for (const dir of [
    `${os.homedir()}/.local/bin`,
    "/usr/local/bin",
    "/opt/homebrew/bin",
  ]) {
    if (fs.existsSync(`${dir}/${command}`)) return `${dir}/${command}`;
  }
  return command; // hope PATH has it
}
