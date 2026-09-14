---
name: operate-ai-company-os
description: >-
  Operate ai-company-os companies via MCP or CLI — plan, launch, run ticks,
  chief chat, check-ins, approvals, budget, data, and connectors. Use when the
  user wants to run or manage an AI company swarm, or mentions ai-company-os,
  company ticks, plans, or the JSON CLI/MCP control plane.
---

# Operate ai-company-os

You are driving **ai-company-os** as a host agent (Cursor / Claude / Codex). Prefer the **MCP server** or **CLI** — not the web UI.

This skill is for *you* (the host). Do **not** confuse it with repo `skills/*/SKILL.md` — those are playbooks copied into companies for *company* agents at tick time.

## Setup

- Workspace root = folder with `ai-company-os.json` and `companies/` (`AI_COMPANY_OS_ROOT` or `AI_COMPANY_OS_WORKSPACE`).
- MCP: `ai-company-os-mcp` / `node dist/mcp.js` — see [docs/MCP.md](../../../docs/MCP.md).
- CLI: `ai-company-os --json …` with `-c <slug>` when needed — see [docs/CLI.md](../../../docs/CLI.md).
- Destructive deletes need `--yes` or `AI_COMPANY_OS_YES=1` (MCP curated tools usually set yes).
- To watch live progress in the dashboard, open `/company/<slug>` against the **same** workspace root as MCP (UI remembers a folder; MCP uses env or cwd).

## Default loop

1. `workspace_info` (or confirm cwd / env root)
2. `companies` — pick slug
3. `show_state` / `status` / `queue` — understand reality
4. Mutate (chat, run, approve, budget, …)
5. Re-read `show_state` / `queue` before the next mutation

Never spam `tick`/`run` without re-reading state. Handle **pending approvals** before retrying blocked work.

## Verb → tool map

| Intent | Prefer MCP | Else CLI |
|--------|------------|----------|
| List companies | `companies` | `companies --json` |
| Snapshot | `show_state` | `show state -c SLUG --json` |
| Queue | `queue` | `queue -c SLUG --json` |
| One step | `tick` | `tick -c SLUG` |
| Bounded loop | `run` | `run -c SLUG -t N` |
| Chief chat | `chat` | `chat -c SLUG "…"` |
| Pause / resume | `pause` / `resume` | same |
| Approvals | `approvals` / `approve` / `deny` | same |
| Budget | `budget` | `budget -c SLUG` / `--add` |
| Data | `db_list` / `db_query` | `db list` / `db query` |
| Connectors | `connectors_get` | `connectors get` |
| Skills library | `skills_list` | `skills list` |
| Org / LLM pins | `show_org` / `set_agent_llm` | `show org` / `set-llm` |

**Gaps → `run_cli`** (argv array; `--json` injected):

- Plan: `["plan","--auto"]` or `["plan","your goal"]`
- Launch: `["plans","launch","SLUG"]` or `["launch","path/to/plan.json"]`
- Check-in: `["checkin","-c","SLUG"]` / `["checkins","-c","SLUG"]`
- Connectors set / poll, schedule, flush, doctor, export, …

## Efficient patterns

- **New company:** plan (`--auto` when appropriate) → review plan → `plans launch` → `show_state` → bounded `run -t N`.
- **Keep going:** `queue` → if blocked by approvals, resolve → `run -t 10..50` → re-check targets / queue.
- **Queue empty:** chat chief to set/raise numeric **targets** or new work; optional `checkin` for owner brief; do not infinite-replan blindly.
- **Stuck / stall:** read audit + failed tasks; grant budget; adjust goal; `retry` / clear blockers.
- **Perpetuity:** company `schedule` + daemon / `ui --daemon` for wake+ticks+check-ins — configure, don’t babysit every tick in chat.

## Anti-patterns

- Opening the dashboard instead of MCP/CLI for routine ops
- Editing company JSON by hand when a CLI/MCP verb exists
- Confusing host ops with in-company `skills/` playbooks
- Running unbounded loops without `shouldStop` / tick caps in interactive sessions
- Pointing MCP at a different folder than the UI workspace (tasks won’t appear “live”)

## Deeper reference

- Full CLI map: [docs/CLI.md](../../../docs/CLI.md)
- MCP tools + Cursor / Codex config: [docs/MCP.md](../../../docs/MCP.md) and [reference.md](reference.md)
