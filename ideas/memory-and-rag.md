# Memory & retrieval

Agents currently remember nothing across tasks except what's in files they happen to
re-read. Small models especially benefit from externalized memory.

- **Agent memory file:** `agents/<Name>/MEMORY.md`, injected into the prompt (capped).
  After each completed task, the agent appends one line: what worked, what to avoid.
  Grows into a per-role playbook for free.
- **Company knowledge base:** `data/kb/*.md` fragments + a tiny keyword index (sqlite
  FTS5 ships in node:sqlite!). New tool `kb`: `{"op":"search","query":"..."}` /
  `{"op":"add","content":"..."}`. Workers store facts once, everyone retrieves.
- **Chief episodic memory:** the all-knowing chief currently rebuilds knowledge from
  state on every chat. Persisting his own summaries ("week 1: scout found directories
  unreliable") makes him genuinely wiser over time, not just well-briefed.
- **Cross-company recall:** the workspace level could host a shared FTS index over all
  companies' results — "have any of my companies already scraped Munich recruiters?"
