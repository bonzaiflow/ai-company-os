# AI Company OS

Agent-swarm orchestrator built for **small models** (4b–31b class, local via Ollama or hosted via OpenRouter). You plan a "company" of agents in a chat with an LLM, launch it, and a tick-based runtime lets the hierarchy work: the chief breaks tasks down for reports, workers execute with tools, results flow back up.

CLI-first: **all state is plain files on disk** — the web UI renders the same directories the CLI writes.

The dashboard (`ai-company-os ui`) has four views: **Home** (all your AI companies + plan drafts in progress), **Company** (queue/history, organigram with the senior-most agent on top, per-agent tabs, chat with the chief), **Plan** (planning chat with a live roster draft, persisted server-side, Launch button), and **Skills** (view/edit/create skills, upload via .zip or .md). A bottom bar toggles **live tools** (which agent is running which task with which tool, right now) and sets the default LLM per role: *planning*, *agents*, and *execution*. Task execution itself always runs through `ai-company-os run`.

## Tool calling without native tool support

ai-company-os never uses native/MCP function calling. Every agent step is one flat JSON object (`tool | delegate | message | complete`) — models that support structured outputs get grammar-enforced JSON; for backends without it, set `"structured": false` on the provider and ai-company-os falls back to prompt-instructed JSON with lenient parsing. If a model still emits sloppy output, the **execution-role LLM** (a small fast model like gemma3:4b) converts the raw text into a valid action, preserving SQL/urls/paths verbatim — so anything that can write JSON-ish text can drive tools.

## Quick start

```bash
npm install && npm run build
node dist/cli.js init            # creates ai-company-os.json (edit your providers here)

# plan interactively with a model, then /launch from inside the chat
node dist/cli.js plan "scrape leads from google maps, verify against my ICP, store in a db"

# or one shot:
node dist/cli.js plan --auto --launch "build a sqlite db of the 10 largest German cities + report"

node dist/cli.js run             # process the queue until empty / budget hit
node dist/cli.js status          # org chart + queue + budget in the terminal
node dist/cli.js ui              # dashboard at http://localhost:4646 (plan, watch, chat with the chief)
```

(`npm link` once to get a global `ai-company-os` command.)

## Providers (ai-company-os.json)

```json
{
  "defaultProvider": "ollama-local",
  "providers": {
    "ollama-local":  { "type": "ollama", "baseUrl": "http://localhost:11434", "model": "gemma4:12b" },
    "ollama-remote": { "type": "ollama", "baseUrl": "http://REMOTE_HOST:11434", "model": "gemma4:31b" },
    "openrouter":    { "type": "openrouter", "model": "google/gemma-4-31b-it:free", "apiKeyEnv": "OPENROUTER_API_KEY" }
  }
}
```

Per-agent overrides: each agent's `profile.md` can carry `provider:` / `model:` — e.g. run the chief on the remote 31b and workers on the local 4b.

## How it works

Everything lives under `companies/<slug>/`:

```
company.json        budget caps + default provider
plan.md             the approved plan
chat.json           chief ↔ owner chat (dashboard transcript)
planning-chat.json  pre-launch planning transcript (archived on launch)
agents/<Name>/
  profile.md        role, rank, manager, tools, skills   ← the org chart IS these files
  INBOX/ OUTBOX/    message passing between agents
  workspace/        the agent's own thoughts, one file per task
  CHAT.md           human-readable chief chat log (append-only)
tasks/TASK-0001.md  status, assignee, parent + description + result
queue.json          pending task ids, in order
audit.jsonl         every event: llm.call, tool.*, delivery.*, task.*, queue.*
data/               shared artifacts (sqlite dbs, reports, notes)
skills/             SKILL.md files injected into agent prompts
```

One **tick** = pop the next queued task, wake its assignee, let it act step by step (max `--steps`). Each step the model returns exactly one flat JSON action, grammar-enforced via structured outputs:

- `tool` — run `filesystem`, `fetch`, or `sqlite` (sandboxed to the company dir)
- `delegate` — create subtasks for direct reports; the task goes to `waiting`
- `message` — drop a note in another agent's INBOX
- `complete` — write the result, report to the manager's INBOX

When the last child of a waiting task finishes, the parent re-enqueues automatically and its owner synthesizes the children's results. Failures propagate the same way. Budget caps (tokens / tool calls / hours) are checked before every tick.

Everything the model sees is kept deliberately small — profile + skills + task + inbox + step transcript — because the whole point is making 4b-class models useful through narrow roles and short horizons.

## Commands

| command | what |
|---|---|
| `ai-company-os init` | scaffold workspace + provider config |
| `ai-company-os plan [goal]` | chat-plan a company (`/launch`, `/save`, `/quit`); `--auto` for one shot |
| `ai-company-os launch <plan.json>` | launch a saved plan |
| `ai-company-os task <title>` | enqueue a new root task for the chief |
| `ai-company-os tick` / `ai-company-os run` | process one task / run until idle (`-t` max ticks, `--steps`) |
| `ai-company-os status` / `queue` / `log` | org chart · task list · audit tail |
| `ai-company-os agent <Name>` | an agent's profile + workspace files |
| `ai-company-os ui` | web dashboard (default port 4646): organigram, tasks, audit; per-agent tabs (overview / tasks / files / audit); planning chat + launch; chat with the chief |
| `ai-company-os companies` | list companies in the workspace |

## Perpetuity, control, auditing, check-ins

ai-company-os companies are built to run forever under owner control:

- **Perpetual**: `ai-company-os schedule --every 30 --ticks 5` + `ai-company-os daemon` (or `ai-company-os ui --daemon`) wakes each company on its own cadence; `ai-company-os task "..." --recur 24` re-creates a task every N hours (`recurring.json`).
- **Pause/resume**: `ai-company-os pause` / `ai-company-os resume` (or the ⏸ button) — a paused company never ticks.
- **Approval gates**: `policies.approveTools: ["fetch"]` in `company.json` parks any task the moment an agent wants that tool, files an approval with the exact args, and resumes after `ai-company-os approve <id>` / `ai-company-os deny <id>` (or the ✓ Approvals panel).
- **Budgets**: company token caps count down to 0 (grant more explicitly); per-agent caps via `budgetTokens:` in the agent profile.
- **Tamper-evident audit**: every event is hash-chained (`h = sha256(prev + event)`); `ai-company-os audit verify` proves the log wasn't altered; export from the UI.
- **Check-ins**: the chief writes you a brief (progress, questions, needs) on a cadence or via `ai-company-os checkin` — answer in the chief chat.

See [ideas/positioning-vs-paperclip.md](ideas/positioning-vs-paperclip.md) for how this differs from Paperclip.

## Connectors (email, Telegram, webhooks)

Companies can talk to the outside world through **connectors** configured per company (`company.json` → `connectors`, or the **Connectors** panel in the company UI). Secrets stay in environment variables; config only stores the *names* of those vars (same pattern as `apiKeyEnv` for LLM providers). See [`.env.example`](.env.example).

| Connector | Outbound tool | Inbound |
|---|---|---|
| **Email** | `email` (`op: send`) via SMTP | IMAP poll → agent INBOX + task |
| **Telegram** | `telegram` (`op: send`) | Bot `getUpdates` poll → usually **chief** |
| **Webhook** | `webhook` (`op: post`) | `POST /api/hooks/<slug>` with `x-connector-secret` |

Inbound events become INBOX markdown (with `channel` / `externalId` frontmatter) and a high-priority task for `routeTo` (default: chief). The daemon polls email/Telegram on each wake; you can also **Poll now** from the UI.

Outbound sends are network tools — assign them on agent profiles (planner allow-list includes `email`, `telegram`, `webhook`). Prefer gating them with `policies.approveTools: ["email","telegram","webhook"]` so the owner approves each send.

Telegram tip: create a bot with BotFather, set `TELEGRAM_BOT_TOKEN`, put your chat id in `allowedChatIds`, give the chief the `telegram` tool, and message the bot — the next daemon wake (or Poll now) delivers it.

Webhook tip: `curl -X POST http://localhost:4646/api/hooks/<slug> -H 'content-type: application/json' -H "x-connector-secret: $WEBHOOK_SECRET" -d '{"text":"hello","from":"zapier"}'`

Companies are plain folders under `companies/<slug>/` — zip and share them anytime. From the dashboard: **More → Export** (layout or full). CLI:

```bash
ai-company-os export <slug> --mode layout   # plan + org + skills + settings (no tasks/data)
ai-company-os export <slug> --mode full     # entire company folder
ai-company-os export <slug> -o ~/Desktop/acme-layout.zip
```

## Skills

`skills/<name>/SKILL.md` (claude-style) are copied into a company at launch and injected into the prompts of agents that list them. Bundled: `web-research`, `data-entry`, `delegation`, `reporting`. Your workspace `skills/` directory overrides bundled skills of the same name — manage it from the Skills view in the UI (inline editor, .zip/.md upload) or just drop folders in.

## Providers & roles

`ai-company-os.json` also holds per-role defaults, editable from the UI's bottom bar:

```json
"roles": { "planning": "ollama-local", "agents": "ollama-local", "execution": "ollama-local-small" }
```

- **planning** — powers `ai-company-os plan` and the UI planning chat
- **agents** — default for agent steps and the chief chat (an agent's own `provider:` in profile.md wins; the company default is the last fallback)
- **execution** — the mechanical-JSON model used to repair malformed actions

## Development

```bash
npm run build     # tsc → dist/
npm run smoke     # end-to-end run on a scripted mock provider, no model needed
```
