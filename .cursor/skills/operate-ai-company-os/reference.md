# operate-ai-company-os — reference

## Cursor `mcp.json` example

```json
{
  "mcpServers": {
    "ai-company-os": {
      "command": "node",
      "args": ["/absolute/path/to/ai-company-os/dist/mcp.js"],
      "env": {
        "AI_COMPANY_OS_ROOT": "/absolute/path/to/your/workspace"
      }
    }
  }
}
```

Or after `npm link`: `"command": "ai-company-os-mcp"` with the same `env`.

## Curated MCP tools

| Tool | Purpose |
|------|---------|
| `run_cli` | Escape hatch: any CLI argv (`--json` injected) |
| `workspace_info` | Which root the server uses |
| `companies` | List companies |
| `status` / `show_state` / `queue` | Live snapshot |
| `chat` | Message the chief |
| `tick` / `run` | Advance work |
| `approvals` / `approve` / `deny` | Governance |
| `pause` / `resume` | Owner stop/start |
| `budget` | Inspect / grant tokens |
| `db_list` / `db_query` | Read company SQLite |
| `connectors_get` | Connector config status |
| `skills_list` | Workspace/bundled skills |
| `config_get` / `config_set` | Role/model defaults |
| `plans_list` | Planning drafts |
| `show_org` / `agent_llm` / `set_agent_llm` | Per-agent LLM |

Suggested loop: `workspace_info` → `companies` → `show_state` → act → re-read.

## Common `run_cli` argv

```text
["plan","--auto"]
["plans","launch","my-plan"]
["checkin","-c","acme"]
["checkins","-c","acme"]
["connectors","set","-c","acme", ...]
["schedule","-c","acme","--every","30","--ticks","20"]
["flush","-c","acme","--yes"]
["doctor"]
```

Full map: `docs/CLI.md`.
