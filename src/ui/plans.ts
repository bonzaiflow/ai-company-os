import fs from "node:fs";
import path from "node:path";

/** Each plan lives in its own folder (plans/<slug>/plan.json + chat.json) so
 * the whole folder can be shared — legacy flat files are still readable. */
export function planFile(root: string, slug: string): string {
  const foldered = path.join(root, "plans", slug, "plan.json");
  const legacy = path.join(root, "plans", `${slug}.json`);
  return !fs.existsSync(foldered) && fs.existsSync(legacy) ? legacy : foldered;
}

export function planChatFile(root: string, slug: string): string {
  const foldered = path.join(root, "plans", slug, "chat.json");
  const legacy = path.join(root, "plans", `${slug}.chat.json`);
  return !fs.existsSync(foldered) && fs.existsSync(legacy) ? legacy : foldered;
}

export function deletePlanFiles(root: string, slug: string): void {
  fs.rmSync(path.join(root, "plans", slug), { recursive: true, force: true });
  fs.rmSync(path.join(root, "plans", `${slug}.json`), { force: true });
  fs.rmSync(path.join(root, "plans", `${slug}.chat.json`), { force: true });
}
