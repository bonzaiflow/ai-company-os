/** Single-page dashboard, embedded so packaging stays trivial.
 * Design system mirrors the BonzaiSoft "AI Company OS" app (ai-company-os/web):
 * same tokens (#0c0f14 bg, #141a22 surface), DM Sans + JetBrains Mono,
 * accent-barred cards, tinted rank/status pills, pill tabs, glow gradients.
 * Client JS deliberately avoids template literals so fragments can be joined
 * into one PAGE string. */
import { HEAD } from "./head.js";
import { CSS } from "./styles/index.js";
import { BODY } from "./body/index.js";
import { SCRIPT } from "./script/index.js";

export const PAGE =
  "<!doctype html>\n<html>\n<head>\n" +
  HEAD +
  "<style>\n" +
  CSS +
  "\n</style>\n</head>\n<body>\n" +
  BODY +
  "\n<script>\n" +
  SCRIPT +
  "\n</script>\n</body>\n</html>\n";
