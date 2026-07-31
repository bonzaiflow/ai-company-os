# Observability & replay

audit.jsonl already records everything; nothing renders it as insight yet.

- **Cost breakdown:** tokens per agent, per task, per model — a simple treemap answers
  "where did my 500k tokens go?" (llm.call events already carry counts).
- **Latency:** wall-clock per step and per tick from audit timestamps; spot the worker
  that spends 90% of the time waiting on fetch timeouts.
- **Run replay:** a task's transcript + audit events are enough to re-render the whole
  execution step by step in the task modal ("player" with a timeline scrubber). Great
  for debugging why a 4b model went sideways at step 7.
- **Diffable runs:** run the same root task twice (different models via the roles bar)
  and diff outcomes: steps used, tokens, verified rows. This is the eval harness for
  the model-routing idea, nearly for free.
- **Export:** `ai-company-os report <task>` → a self-contained markdown/HTML report (result,
  evidence, timeline) suitable for handing to a human client.
