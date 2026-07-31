# Positioning: AI Company OS vs. Paperclip

Paperclip (github.com/paperclipai/paperclip, 73k★) is the incumbent "AI company OS":
org charts, tickets, budgets, governance, heartbeats — as a control plane for
**bring-your-own agents** (Claude Code, Codex, HTTP bots) over Node + PostgreSQL.

ai-company-os wins by NOT being that. Four deliberate bets:

## 1. Perpetuity (built-in, not bring-your-own)
Paperclip heartbeats wake external runtimes; each agent is a cloud-model process
someone pays for per token. ai-company-os ships the runtime: `ai-company-os daemon` wakes every
company on its own cadence (`schedule` in company.json), spawns due recurring
tasks (`recurring.json`), runs a bounded number of ticks, writes check-ins — all
against **local models that cost nothing to keep running forever**. Perpetual
operation is only economically sane when inference is free; that's our quadrant.

## 2. Auditing as a first-class artifact
Both have audit logs. Ours is a **tamper-evident hash chain** (`h = sha256(prev + event)`,
`ai-company-os audit verify`) in a plain JSONL file inside a folder you can zip and hand to
anyone — no database export, no access control dance. The company folder IS the
audit package: every prompt decision (thoughts), every tool call with args, every
delivery, every owner intervention (grants, approvals, pauses) in one place.

## 3. Owner control that reaches INTO execution
Paperclip governance approves hires/strategies at the org level. ai-company-os gates the
actual tool call: `policies.approveTools: ["fetch", "email"]` parks the task
mid-step, files an approval with the exact args, and the agent resumes (or is
refused and must adapt) after the owner decides. Plus: pause/resume per company,
per-agent token budgets, token countdown with explicit owner grants — the company
literally cannot spend or act beyond what the owner handed it.

## 4. Check-ins: the company reports to you
Paperclip's model: you watch dashboards. ai-company-os's model: **the chief writes you a
brief** on a cadence (or on demand) — progress with task ids, questions only you
can answer, resource requests — and you answer in chat. The interaction loop is
conversational and initiated by the company, not by you polling.

## Moat nobody else has
Everything above rides on the small-model runtime: constrained JSON actions,
repair pass, repeat-blocking, transcript windowing, tool-result feedback. Paperclip
assumes smart agents; we manufacture usable behavior from 4–12b local models.

## What to adopt from them later
- Goal ancestry on every task (chain up to the mission)
- Plugin agent types (let a Claude Code instance be a ai-company-os "agent")
- Monthly budget windows (ours are lifetime caps + grants)
