/** Concatenated page CSS (order matches original page.ts) */
import { TOKENS } from "./tokens.js";
import { HOME } from "./home.js";
import { LAYOUT } from "./layout.js";
import { SHARED } from "./shared.js";
import { CONDUCTOR } from "./conductor.js";
import { MODALS } from "./modals.js";
import { DB } from "./db.js";
import { SKILLS } from "./skills.js";

export const CSS =
  TOKENS +
  HOME +
  LAYOUT +
  SHARED +
  CONDUCTOR +
  MODALS +
  DB +
  SKILLS;
