# Agent contract — external agents as org-chart workers

ai-company-os is agent-agnostic: anything that can run a shell command or speak MCP can hold a
seat in a company's org chart — Claude Code, Codex, Cursor, Gemini CLI, a cloud bot, a chat
window, or you. **The contract is neutral, not the model.**

Three kinds of agents share one org chart, one queue and one audit trail:

| `runtime:` | Who drives it | How it gets work | Typical seat |
|---|---|---|---|
| `internal` (default) | the tick engine, one LLM call per step | engine claims it | lead scraping, data entry with small local models |
| `external` | an autonomous agent with its own tools and loop | **pull**: the agent calls `work next` · **push**: `adapter:` → the engine starts it | chief, verifier, developer |
| `manual` | a human or a chat window | owner is notified (Telegram), result via CLI or dashboard | approvals, a claude.ai chat |

External and manual agents take a **whole task** and finish it with one of the same actions
internal agents have: `done`, `fail`, `delegate`, `release` (plus `message` and `heartbeat`).

## Lease

Claiming a task gives the caller a **lease**: `{ id, holder, via, claimedAt, until }`, stored on
the task (status `running`). Every call that changes the task must pass the lease id — two
sessions acting as the same agent can never finish each other's work.

- TTL: `leaseMinutes` from the profile, default 30 min (external) / 24 h (manual).
- `heartbeat` extends it by the TTL, capped at `claimedAt + maxMinutesPerTask`.
- An expired lease returns the task to the queue and **counts as a failed attempt**
  (`lease.expired` in the audit). After `maxAttempts` (default 3) the task fails.
- `release` hands it back without counting an attempt.

```
queued ──claim──▶ running(lease) ──done────▶ done ─▶ manager INBOX, parent wakes
                      │  ├─delegate─▶ waiting ─(children finished)─▶ queued (back to you)
                      │  ├─fail─────▶ queued (retry) | failed
                      │  ├─release──▶ queued (front)
                      │  └─lease ran out─▶ queued (+1 attempt)
                      └─approveResults─▶ waiting (owner review) ─approve─▶ done / deny ─▶ queued
```

## Commands

Run from the workspace root, or set `AI_COMPANY_OS_ROOT`. Identity: `--as <Name>` or
`AI_COMPANY_OS_AGENT`. Add `-c <slug>` when the workspace has several companies.

```sh
ai-company-os --json work next      -c SLUG --as NAME [--wait 60]    # claim (or resume) → { task, lease, brief }
ai-company-os --json work brief     TASK -c SLUG --lease ID          # the assignment again
ai-company-os --json work heartbeat TASK -c SLUG --lease ID          # keep it
ai-company-os --json work done      TASK -c SLUG --lease ID (--result TEXT | --result-file F) [--tokens N]
ai-company-os --json work fail      TASK -c SLUG --lease ID --reason TEXT [--no-retry]
ai-company-os --json work delegate  TASK -c SLUG --lease ID --subtasks '[{"title","description","assignee"}]'  # or @file.json
ai-company-os --json work release   TASK -c SLUG --lease ID [--reason TEXT]
ai-company-os --json work message   -c SLUG --as NAME --to OTHER --text TEXT [--task TASK]
ai-company-os --json work inbox     -c SLUG --as NAME                # unread, not consumed
```

Exit codes: `0` ok · `2` bad input / unknown agent / internal agent · `3` nothing to do (`{ idle: true }`) ·
`4` lease missing, foreign or expired · `5` company paused, budget exhausted or `maxTasksPerDay` reached.

The **brief** (`work next` / `work brief`) is self-contained: role, company goal, the chain of
parent tasks up to the goal, the task, a numeric target if any, the previous failure, results of
finished subtasks, messages, responsibilities, skills, where to write output, and the exact
commands above with the lease filled in. You can paste it into any chat.

Rules for external agents: read anything in the company folder; write output under `data/` and
notes under your `agents/<Name>/workspace/`; never edit `tasks/`, `queue.json`, `audit.jsonl`
or other agents' files directly; never send email/Telegram/webhooks yourself — those go through
company tools so they stay behind `approveTools`.

## MCP

`ai-company-os-mcp` exposes the same contract: `work_next`, `work_brief`, `work_heartbeat`,
`work_done`, `work_fail`, `work_delegate`, `work_release`, `work_message`, `work_inbox`. Pin who a
host is with one MCP entry per agent:

```json
{
  "mcpServers": {
    "company-verifier": {
      "command": "ai-company-os-mcp",
      "env": { "AI_COMPANY_OS_ROOT": "/path/to/workspace", "AI_COMPANY_OS_AGENT": "Verifier" }
    }
  }
}
```

`work_next` with `{ idle: true }` is a normal answer, not an error.

## Push adapters

With `adapter:` the engine (`run`, `tick`, the daemon, the dashboard) starts the agent itself for
each ready task — in parallel with internal agents, counted against `maxParallel`:

1. claims the task with a push lease and writes the brief to `agents/<Name>/workspace/<TASK>.brief.md`
2. runs the command template from `ai-company-os.json → agentRuntimes` in the agent's workspace
   (or its `cwd:`, which must be under `allowedCwds`), logging to `<TASK>.log`
3. heartbeats while the process lives; kills it at `maxMinutesPerTask` (or `timeoutMinutes`, default 60)
4. reads the reply: the **last JSON object** in the output —
   `{"action":"done","result":…}`, `{"action":"fail","reason":…}` or `{"action":"delegate","subtasks":[…]}`.
   No JSON → with `onExit: "stdout"` (default) the whole output is the result; with `"strict"` it is a failure.
   Exit code ≠ 0 or timeout → failed attempt.

A push agent may also report through `work …` itself (the child gets `AI_COMPANY_OS_ROOT`,
`AI_COMPANY_OS_COMPANY`, `AI_COMPANY_OS_AGENT`, `AI_COMPANY_OS_TASK`, `AI_COMPANY_OS_LEASE`);
the engine then sees the task is no longer held and leaves it alone.

Built-in presets (override or add your own):

```json
"agentRuntimes": {
  "claude-code": { "type": "command", "argv": ["claude", "-p", "--output-format", "json", "--permission-mode", "acceptEdits", "{prompt}"], "usage": "claude-json" },
  "cursor":      { "type": "command", "argv": ["cursor-agent", "-p", "--output-format", "text", "--trust", "{prompt}"] },
  "codex":       { "type": "command", "argv": ["codex", "exec", "--sandbox", "workspace-write", "--skip-git-repo-check", "--output-last-message", "{outputFile}", "{prompt}"] },
  "gemini":      { "type": "command", "argv": ["gemini", "-p", "{prompt}"] }
},
"allowedCwds": ["~/privat"]
```

Placeholders: `{prompt}` `{promptFile}` `{outputFile}` `{taskId}` `{agent}` `{company}`
`{companyDir}` `{cwd}` `{lease}`. If `{outputFile}` exists and is non-empty after the run, its
content is read instead of stdout. `usage: "claude-json"` takes the reply and token usage from
`claude -p --output-format json`. Flags of third-party CLIs change — `ai-company-os doctor`
checks each launcher is installed; the claude-code and cursor presets were checked against the
installed CLIs, codex and gemini follow their docs.

Sandboxing is the adapter's job: restrict the agent through its own flags (permission modes,
sandbox modes, allowed tools) and a narrow `cwd`. Prompt injection from scraped pages is real
for agents with a shell — keep secrets out of their environment and outbound actions behind
company tools.

## Remote access (HTTP and remote MCP)

For agents that cannot run the CLI on this machine — cloud agents, Claude Desktop / claude.ai
connectors, bots elsewhere — `serve-agents` exposes **only** the work contract (no dashboard, no
operator actions), and every request needs the agent's own token:

```sh
ai-company-os agent-token Verifier -c acme --write-env   # sets tokenEnv in the profile, appends AICOS_TOKEN_VERIFIER=… to .env
ai-company-os serve-agents --port 4848                    # binds 127.0.0.1 by default
```

| Endpoint | What |
|---|---|
| `POST /api/work/<slug>/<action>` | `next` `brief` `heartbeat` `done` `fail` `delegate` `release` `message` `inbox` — JSON body with the same fields as the CLI (`taskId`, `lease`, `result`, `reason`, `subtasks`, `to`, `text`, `wait`, `tokens`) |
| `POST /mcp/<slug>` | MCP Streamable HTTP (stateless) with `work_*` tools; identity comes from the token |
| `POST /mcp/<slug>/t/<token>` | same, token in the URL — only for clients that cannot send headers; treat the URL as a secret |
| `GET /health` | liveness |

`Authorization: Bearer <token>`. Status codes: `401` bad token (also for unknown companies), `409` lease
or not your task, `400` bad input, `423` paused/budget/daily cap, `429` rate limit. Limits: 120 requests
per minute per agent, 20 failed logins per minute per client IP (`--trust-proxy` makes the limit use
`X-Forwarded-For` — only behind your own proxy). A token only ever acts as its agent: task actions are
refused unless the task is assigned to that agent. Tokens are at least 24 characters; rotate one by
running `agent-token` again and restarting `serve-agents`.

**Reaching it from outside.** Keep `serve-agents` on 127.0.0.1 and put TLS in front:

- Cloudflare Tunnel: `cloudflared tunnel --url http://127.0.0.1:4848` (quick test) or a named tunnel with your domain.
- SSH reverse tunnel to a server you already run (e.g. the Dokploy host) and route a subdomain to it with
  its reverse proxy: `ssh -N -R 127.0.0.1:4848:127.0.0.1:4848 user@server`, then `serve-agents --trust-proxy`.
- Run the workspace on that server directly and point the proxy at port 4848.

Never expose `ai-company-os ui` this way — the dashboard has no login.

Claude Code example (remote MCP with header):

```sh
claude mcp add --transport http company-verifier https://agents.example.com/mcp/acme --header "Authorization: Bearer $AICOS_TOKEN_VERIFIER"
```

## Template

`ai-company-os templates` lists bundled company templates; `ai-company-os launch mixed-lead-company`
starts one — an external chief (claude-code push), a local-model scout, an external verifier
(codex push) and you as manual approver, with a monthly cap. Edit the adapters to what you have
installed (`set-runtime`), or copy `templates/mixed-lead-company.plan.json` as a starting point.

## Profile fields

```yaml
runtime: external            # internal | external | manual
adapter: codex               # push launcher; omit for pull
cwd: ~/privat/patund         # push run directory (needs allowedCwds)
leaseMinutes: 30
maxTasksPerDay: 20           # claims per UTC day (pull and push)
maxMinutesPerTask: 45        # hard cap: lease end / process kill
monthlyBudgetTokens: 2000000 # per calendar month (UTC); budgetTokens stays the lifetime cap
approveResults: true         # owner reviews the result before done
toolMode: native             # native (own tools) | company (brief says: only ai-company-os tools)
tokenEnv: AICOS_TOKEN_X      # reserved for remote/HTTP access
```

Set them in `profile.md`, in the plan JSON, or with:

```sh
ai-company-os set-runtime Verifier -c SLUG --runtime external --adapter codex --max-minutes-per-task 30
ai-company-os set-runtime Owner    -c SLUG --runtime manual --approve-results true
ai-company-os set-runtime Chief    -c SLUG --runtime external --adapter ""      # pull
```

## Owner controls

- **Dashboard**: org cards show `external · pull`, `push · <adapter>` or `manual`. A held task
  shows holder, lease and last heartbeat with **Take back**; tasks of external/manual agents have
  **Enter the result** (paste a chat's answer) with Mark done / Mark failed.
- **Review**: with `approveResults`, `done` files an approval (`owner.review`) — `approve` finishes
  the task, `deny -n "…"` sends it back with the note in the agent's inbox.
- **Telegram**: with the Telegram connector, each new ready task of a manual agent is announced once.
- **Budgets**: reported tokens (`--tokens`, or parsed from the adapter) count against company and
  per-agent caps; `maxTasksPerDay` and `maxMinutesPerTask` bound agents that report nothing.
  Monthly windows reset every calendar month (UTC): `budget --monthly <tokens>` for the company,
  `monthlyBudgetTokens:` per agent.
- **Costs per agent**: `ai-company-os budget` (and the Usage box in an agent's Overview tab) shows
  tokens this month / total, the minutes external and manual agents held tasks (lease time — the
  cost signal for agents whose own model usage is unknown) and done/failed counts.

## Concurrency

The daemon, the dashboard, MCP, CLI calls and external agents may all touch a company at once.
Every read-modify-write of shared state (claims, queue, audit chain, budget, approvals) runs under
a cross-process lock (`companies/<slug>/.lock`), and files are written atomically (temp + rename).
`npm run test:race` runs several processes against one company and checks that no task is claimed
twice, no queue update is lost and the audit hash chain stays intact.
