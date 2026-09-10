#!/usr/bin/env node
/**
 * MCP stdio entry — thin wrapper; tools live in ./mcp/server.js
 */
import { startMcpServer } from "./mcp/server.js";

startMcpServer().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
