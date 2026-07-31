# Scheduler & perpetual companies

The engine is tick-based, so "perpetual" is just "someone keeps calling tick".

- **`ai-company-os daemon`:** one process that loops over ALL companies: tick each company with
  queued work, sleep when idle, wake on queue changes (fs.watch on queue.json). The UI
  Run buttons then become "pause/resume" on the daemon instead of owning execution.
- **Recurring tasks:** `schedule.json` per company: `{cron: "0 7 * * *", title: "Check
  the 3 news sites and update the digest"}` — the daemon enqueues a fresh root task per
  firing. That turns the AI-news-monitor use case into a real product.
- **Watchdog tasks:** a standing task template that re-runs when a condition holds
  ("if firms table has rows with verified=0 older than 1 day → enqueue re-verification").
- **Backpressure:** perpetual mode makes the token countdown critical — daily budget
  resets (`budget.dailyTokens`) so a runaway loop can't burn a month of quota overnight,
  and the chief asks for a bigger daily allowance when it keeps hitting the ceiling.
