import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { formatCliResult, resolveWorkspaceRoot, runCli } from "./run.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "ai-company-os",
    version: "0.1.0",
  });

  server.registerTool(
    "run_cli",
    {
      title: "Run ai-company-os CLI",
      description:
        "Run any ai-company-os CLI command with --json. Pass argv without the binary name " +
        '(e.g. ["companies"] or ["show","state","-c","acme"] or ["chat","-c","acme","status?"]). ' +
        "Workspace is AI_COMPANY_OS_ROOT / cwd. See docs/CLI.md for the full command map.",
      inputSchema: {
        argv: z
          .array(z.string())
          .min(1)
          .describe('CLI arguments after the binary, e.g. ["status","-c","acme"]'),
        cwd: z
          .string()
          .optional()
          .describe("Workspace root override (default: AI_COMPANY_OS_ROOT or process cwd)"),
        timeout_ms: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Kill the command after this many ms (default 600000)"),
      },
    },
    async ({ argv, cwd, timeout_ms }) => {
      const result = await runCli({ argv, cwd, timeoutMs: timeout_ms });
      const formatted = formatCliResult(result);
      return {
        content: [{ type: "text" as const, text: formatted.text }],
        isError: formatted.isError,
      };
    }
  );

  server.registerTool(
    "workspace_info",
    {
      title: "Workspace info",
      description: "Show which workspace root this MCP server will use for CLI commands.",
      inputSchema: {
        cwd: z.string().optional().describe("Optional override to resolve"),
      },
    },
    async ({ cwd }) => {
      try {
        const root = resolveWorkspaceRoot(cwd);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  root,
                  env: process.env.AI_COMPANY_OS_ROOT || process.env.AI_COMPANY_OS_WORKSPACE || null,
                  processCwd: process.cwd(),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: (e as Error).message }],
          isError: true,
        };
      }
    }
  );

  return server;
}

export async function startMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
