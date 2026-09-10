import type http from "node:http";

/** Per-request context shared by UI route modules. */
export type RouteCtx = {
  root: string;
  bundledSkillsDir: string;
  req: http.IncomingMessage;
  res: http.ServerResponse;
  url: URL;
};

/** Return true when the request was handled (response already sent). */
export type RouteHandler = (ctx: RouteCtx) => Promise<boolean>;
