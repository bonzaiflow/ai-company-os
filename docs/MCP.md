# MCP server

`ai-company-os-mcp` is a **stdio MCP server** that wraps the JSON CLI. An LLM host (Cursor, Claude Desktop, etc.) can operate the whole product without starting the web UI.

## Setup

```bash
npm install && npm run build
# optional: npm link   # exposes ai-company-os-mcp on PATH
```

Point the server at your **workspace root** (the folder with `ai-company-os.json` / `companies/`):

| Env | Meaning |
|---|---|
| `AI_COMPANY_OS_ROOT` | Preferred workspace directory |
| `AI_COMPANY_OS_WORKSPACE` | Alias for the same |
| (default) | `process.cwd()` of the MCP process |

Destructive CLI deletes still require `--yes` on `run_cli` argv, or set `AI_COMPANY_OS_YES=1` (the MCP runner sets this by default so curated tools can delete when the model asks).

## Cursor (`mcp.json`)

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

Or after `npm link`:

```json
{
  "mcpServers": {
    "ai-company-os": {
      "command": "ai-company-os-mcp",
      "env": {
        "AI_COMPANY_OS_ROOT": "/absolute/path/to/your/workspace"
      }
    }
  }
}
```

## Tools

### Escape hatch

| Tool | Purpose |
|---|---|
| `run_cli` | Any command: `argv` like `["show","state","-c","acme"]` ( `--json` injected ) |
| `workspace_info` | Resolve which root will be used |

Full command map: [CLI.md](./CLI.md).

### Curated (common dashboard actions)

| Tool | CLI equivalent |
|---|---|
| `companies` | `companies` |
| `status` | `status` |
| `show_state` | `show state` |
| `queue` | `queue` |
| `chat` | `chat <message>` |
| `tick` / `run` | `tick` / `run` |
| `approvals` / `approve` / `deny` | same |
| `pause` / `resume` | same |
| `budget` | `budget` / `budget --add` |
| `db_list` / `db_query` | `db list` / `db query` |
| `connectors_get` | `connectors get` |
| `skills_list` | `skills list` |
| `config_get` | `config get` |
| `config_set` | `config set --role … --model …` |
| `plans_list` | `plans list` |
| `show_org` | `show org` (effective LLM per agent) |
| `agent_llm` | `agent <name>` |
| `set_agent_llm` | `set-llm <name> -p … -m …` / `--clear` |

### Mixed sources example

Pin different providers on one company (defaults unchanged until you pin):

```text
set_agent_llm  name=Chief       provider=claude     model=sonnet
set_agent_llm  name=Developer   provider=cursor     model=auto
set_agent_llm  name=Researcher  provider=openrouter model=google/gemma-4-31b-it:free
show_org       company=acme
```

Anything else (skills save, connectors set, plans launch, export, flush, …) goes through `run_cli`.

## Suggested agent loop

1. `workspace_info` → confirm root  
2. `companies` → pick slug  
3. `show_state` with `company` → snapshot  
4. Act with curated tools or `run_cli`  
5. Re-read `show_state` / `queue` after mutations  

## Dev

```bash
npm run mcp          # build + start stdio server (host-driven; not interactive alone)
```
