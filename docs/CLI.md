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
| `show meta` / `show org` | company.json + agent profiles |
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
| `connectors poll` / `connectors test <kind>` | Poll now / test send |

Inbound webhook HTTP (`POST /api/hooks/<slug>`) stays HTTP-only — use curl or any HTTP client from MCP if needed.

### Skills

| CLI | UI / API |
|---|---|
| `skills list` / `skills show` / `skills save` | Skills editor |
| `skills delete --yes` / `skills upload <zip>` | delete / import |

---

## Suggested MCP tool wrapping

Expose the binary as one tool (`run_ai_company_os`) with args `argv: string[]`, always prepend `--json`, and set `cwd` to the workspace. Example invocations:

```text
["--json", "companies"]
["--json", "show", "state", "-c", "acme"]
["--json", "chat", "-c", "acme", "What is blocked?"]
["--json", "approvals", "-c", "acme"]
["--json", "approve", "-c", "acme", "APR-…"]
["--json", "tick", "-c", "acme"]
["--json", "db", "list", "-c", "acme"]
["--json", "connectors", "get", "-c", "acme"]
```

Prefer `show state` for a single snapshot before acting.

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
