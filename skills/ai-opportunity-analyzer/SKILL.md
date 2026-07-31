# AI Opportunity Analyzer

Highest-value enrichment: decide what AI/automation could improve for this firm —
from observed gaps only. Never invent missing features you did not check for.

## Look for (absence = opportunity)
No chatbot / AI assistant · No lead capture / newsletter form · No CRM/marketing hints ·
Manual booking ("anrufen", "Termin telefonisch") · Manual quoting ("Angebot anfordern"
without configurator) · No FAQ · No online appointments · No site search ·
No translations / hreflang · Outdated stack / poor quality_score · No review response
culture signals

## Process
1. Read site_signals + website.md + contacts for the firm.
2. List each gap with evidence quote or `checked_not_found`.
3. Map gaps → potential products (see reference.md): AI Receptionist, Booking Bot,
   FAQ/Knowledge Base, Lead Capture, Quote Assistant, Website Redesign, Multilingual, …
4. Estimate ranges only as labeled estimates (not facts):
   hours_saved_per_month, cost_reduction_eur_month, revenue_upside_eur_month —
   use conservative bands; cite the gap that drives each estimate.

## Output
```
{"opportunities":[{"gap":"no_chatbot","product":"AI Receptionist","evidence":"…",
 "est_hours_saved_mo":10,"priority":"high"}],
 "summary":"…"}
```
priority: high if customer-facing + clear gap; medium otherwise.
