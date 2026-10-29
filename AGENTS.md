# AGENTS.md — operating ai-company-os

Instructions for **host** agents (Cursor, Claude Code, Codex, etc.) driving this product.

Prefer **MCP** (`ai-company-os-mcp`) or **`ai-company-os --json`**. The web UI is optional.

Detailed playbook: [`.agents/skills/operate-ai-company-os/SKILL.md`](.agents/skills/operate-ai-company-os/SKILL.md)  
(Cursor and Claude Code load the same skill via `.cursor/skills/` / `.claude/skills/` symlinks.)  
CLI / MCP maps: [`docs/CLI.md`](docs/CLI.md), [`docs/MCP.md`](docs/MCP.md)

## Working *inside* a company (as an org-chart agent)

If you were given an agent name in a company (profile `runtime: external` or `manual`), you are not the operator — you are a worker. Follow [`.agents/skills/work-as-company-agent/SKILL.md`](.agents/skills/work-as-company-agent/SKILL.md) and the contract in [`docs/AGENT-CONTRACT.md`](docs/AGENT-CONTRACT.md): `work next` → do the task → `work done` / `fail` / `delegate`.

## Not the same as `skills/`

Repo [`skills/*/SKILL.md`](skills/) are **company-agent** playbooks (loaded into tick prompts). Do not treat them as your operator manual.

## Loop

1. Resolve workspace (`AI_COMPANY_OS_ROOT` / cwd with `ai-company-os.json`)
2. `companies` → pick `-c <slug>`
3. `show state` / `queue` / `status`
4. Act: `chat`, `tick`, `run -t N`, approvals, budget, `checkin`, …
5. Re-read state before the next action

## Quick commands

```bash
ai-company-os --json companies
ai-company-os --json show state -c SLUG
ai-company-os --json queue -c SLUG
ai-company-os --json chat -c SLUG "…"
ai-company-os --json run -c SLUG -t 20
ai-company-os --json checkin -c SLUG
ai-company-os --json plan --auto
ai-company-os --json plans launch SLUG
```

Plan → launch → bounded run → check-in / approvals as needed. Set numeric targets via chief chat when queue-empty replanning should continue toward a measurable goal.
