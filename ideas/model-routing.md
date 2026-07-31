# Model routing by task difficulty

The roles bar (planning/agents/execution) is static routing. The interesting version is
dynamic: pick the model per *task*, not per role.

- **Escalation ladder:** every task starts on the cheapest model (gemma3:4b). If the
  task fails (step limit, repeated tool errors, repair passes > N), it automatically
  re-queues on the next tier (12b → remote 31b → openrouter). The audit trail already
  records everything needed to decide.
- **Difficulty hints in plans:** the planner tags each agent `difficulty: low|med|high`
  and launch maps tiers to configured sources. A chief synthesizing 5 child results
  needs a bigger model than a worker doing one sqlite insert.
- **Budget-aware degradation:** when the token countdown crosses 25%, route everything
  to the cheapest source and have the chief mention it when chatted with.
- **Measurable:** ai-company-os can log (model, task type, steps used, failed/succeeded) and
  build a local routing table from its own history — no external eval needed.
