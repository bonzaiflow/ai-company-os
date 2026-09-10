# CLI reference (humans + MCP)

The CLI is the **full control plane** for ai-company-os. The web UI is a view over the same files; an LLM/MCP agent should drive the product with `ai-company-os` + `--json` and never need to open the dashboard.

Global flags:

```bash
ai-company-os --json <command> …     # machine-readable stdout
ai-company-os <command> --json …     # same (most subcommands)
ai-company-os <command> -c <slug> …  # company when several exist
```

On errors with `--json`, stdout is `{ "ok": false, "error": "…" }` and the process exits non-zero.

Destructive deletes require `--yes` (or `AI_COMPANY_OS_YES=1`).

---

## Mixed LLM sources per agent

Defaults stay as today (workspace `roles.agents` / company `provider`). Any agent can be pinned to a **different provider** from `ai-company-os.json`:

```bash
ai-company-os set-llm Chief -c acme -p claude -m sonnet
ai-company-os set-llm Developer -c acme -p cursor -m auto
ai-company-os set-llm Researcher -c acme -p openrouter -m google/gemma-4-31b-it:free
ai-company-os show org -c acme --json   # see effective sources
ai-company-os set-llm Researcher -c acme --clear   # inherit default again
```

Same company, one `tick`: each assignee uses their own source. Unset agents keep inheriting.

---

## Command map

### Workspace & config

| CLI | UI / API equivalent |
|---|---|
| `init` | first-run workspace |
| `config get` | `GET /api/config` |
| `config set --role planning=… --model agents=…` | `POST /api/config` |
| `config models <provider>` | `GET /api/models` |
| `doctor` | boot health checks |
| `ui` | dashboard (optional) |

Workspace path for the CLI is **cwd** (unlike the UI’s persisted workspace picker). Point MCP at the workspace directory before invoking the binary.

### Planning

| CLI | UI / API |
|---|---|
| `plan` / `plan --auto` / `plan --auto --launch` | Plan view chat + launch |
| `plans list` / `plans show <slug>` | `GET /api/plans`, `GET /api/plan` |
| `plans chat <slug> <msg…>` | `POST /api/plan/chat` |
| `plans upload <slug> <file>` | `POST /api/plan/upload` |
| `plans launch <slug>` | `POST /api/plan/launch` |
| `plans delete <slug> --yes` | `POST /api/plan/delete` |
| `launch <plan.json>` | launch from a plan file path |

### Inspect (read)

| CLI | UI / API |
|---|---|
| `companies` | Home company list |
| `status` | Company masthead + org + queue summary |
| `show state` | `GET /api/state` (+ approvals / checkins / connectors) |
| `show meta` / `show org` | company.json + agents **with effective LLM sources** |
| `agent <name>` | profile + effective LLM |
| `set-llm <name> -p <provider> -m <model>` | pin agent to a source (`--clear` to inherit) |
| `show task <id>` | task modal |
| `show inbox <agent>` | agent INBOX / OUTBOX |
| `show chat` / `show chat --planning` | chief chat / planning archive |
| `show file <path>` / `show files [dir]` / `show write` | file browser (+ write profiles/notes) |
| `show meta-set '<json>'` | patch company.json (policies, roles, …) |
| `queue` / `log` / `agent <name>` | queue, audit tail, agent tab |

### Runtime

| CLI | UI / API |
|---|---|
| `task <title…>` | enqueue work (also via chief chat) |
| `tick` / `run` | Tick / Run loop |
| `retry [id]` / `retry --all-failed` | task retry |
| `priority <id>` | raise task (+ blockers) |
| `flush --yes` | clear queued/waiting |
| `pause` / `resume` | pause button |
| `schedule --every 30 --ticks 5` | schedule panel |
| `daemon` | `ui --daemon` / perpetual wakes |
| `budget` / `budget --add N` | grant tokens |
| `delete --yes` | delete company |
| `export <slug> --mode layout\|full` | Export modal |

### Governance & history

| CLI | UI / API |
|---|---|
| `approvals` / `approve <id>` / `deny <id>` | Approvals panel |
| `checkin` / `checkins` | Check-ins |
| `audit` / `audit verify` | verify chain |
| `audit export` / `audit export -o file` | download audit.jsonl |
| `chat <message…>` | chief chat (non-streaming; history persisted) |

### Data

| CLI | UI / API |
|---|---|
| `upload <file>` | company upload |
| `db list` / `db table` / `db query` / `db export` | SQLite browser |
| `db prompt <db> <nl…>` | NL → SQL (does not execute) |

### Connectors

| CLI | UI / API |
|---|---|
| `connectors get` / `connectors set <json\|file>` | Connectors hub |
| `connectors poll` / `connectors test <kind>` | Poll now / test send (Telegram test sends the button menu) |
| `telegram listen` | long-poll interactive bot for one company |
| `telegram menu` | send Status/Queue/Run/… control pad |
| `telegram webhook set\|delete\|info` | Telegram `setWebhook` against the UI |

Inbound webhook HTTP (`POST /api/hooks/<slug>`) stays HTTP-only — use curl or any HTTP client from MCP if needed.

Telegram bot webhook: `POST /api/hooks/telegram/<slug>` (optional header `x-telegram-bot-api-secret-token`).

**Telegram bot mode (default):** free-text chats with the chief (shared `chat.json`); inline buttons for status, queue, run, pause/resume, and approvals. Use `mode: "task"` for legacy INBOX+task ingest only.

### Skills

| CLI | UI / API |
|---|---|
| `skills list` / `skills show` / `skills save` | Skills editor |
| `skills delete --yes` / `skills upload <zip>` | delete / import |

---

## Suggested MCP tool wrapping

Prefer the built-in stdio server — see **[MCP.md](./MCP.md)** (`ai-company-os-mcp`).

It exposes curated tools plus an escape-hatch `run_cli` that always injects `--json`:

```text
run_cli  argv=["companies"]
run_cli  argv=["show","state","-c","acme"]
run_cli  argv=["chat","-c","acme","What is blocked?"]
```

If you wrap the binary yourself, keep cwd (or `AI_COMPANY_OS_ROOT`) on the workspace and always pass `--json`.

---

## Coverage vs UI APIs

| API | CLI |
|---|---|
| `/api/config` GET/POST | `config get` / `config set` |
| `/api/models` | `config models` |
| `/api/workspace*` | cwd / `init` (no browse picker) |
| `/api/companies` | `companies` |
| `/api/state` | `show state` |
| `/api/company/delete` | `delete` |
| `/api/company/export` | `export` |
| `/api/company/pause` | `pause` / `resume` |
| `/api/company/schedule` | `schedule` |
| `/api/connectors*` | `connectors *` |
| `/api/hooks/telegram/:slug` | `telegram webhook` / Telegram Bot API |
| `/api/approvals*` | `approvals` / `approve` / `deny` |
| `/api/checkin(s)` | `checkin` / `checkins` |
| `/api/audit/*` | `audit` / `audit export` |
| `/api/file` | `show file` |
| `/api/task*` | `show task` / `retry` / `priority` / `flush` |
| `/api/run/*` | `tick` / `run` / `status` |
| `/api/plans` `/api/plan*` | `plans *` / `plan` / `launch` |
| `/api/upload` `/api/plan/upload` | `upload` / `plans upload` |
| `/api/db/*` | `db *` |
| `/api/skills*` | `skills *` |
| `/api/chat` | `chat` |
| `/api/hooks/:slug` | HTTP only (by design) |
| `/api/dev/version` | n/a (UI hot-reload) |

Intentionally UI-only: live SSE tool ticker, folder browse picker, streaming chat tokens (CLI returns the full reply).
