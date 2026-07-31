# Quality gates

The Munich use case showed the pattern: **produce → verify → only then accept**. Make
that a first-class engine concept instead of a plan convention.

- **Verified task state:** tasks get an optional `verifier: <AgentName>` field. When the
  assignee completes, the engine automatically enqueues a verification task for the
  verifier; only its approval flips the original task to `done`, otherwise it bounces
  back to the assignee with the objection attached. Small models lie confidently — an
  independent re-check by a *different* agent (ideally a different model) catches most
  of it.
- **Schema contracts on data:** a plan can declare `deliverables: [{db: main.db, table:
  firms, minRows: 10, notNull: [website, email]}]` — the engine checks mechanically
  before letting the chief report success. No LLM in the loop for the checkable parts.
- **Anti-hallucination primitives in tools:** fetch could return a content hash the
  agent must cite when recording an email (`evidence: <hash>`); the verifier re-fetches
  and compares. Provenance without trusting the model's honesty.
- **Confidence column convention:** skills teach agents to record `verified INTEGER`
  everywhere; the UI could badge tables/rows accordingly in a data browser.
