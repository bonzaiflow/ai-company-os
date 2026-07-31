# Workflow Planner (Meta)

Orchestrator playbook — not a scraper. Turn a goal into an execution graph of skills.

## Example goal
"Find electricians in Bavaria with outdated websites and no chatbot"
→ discover (OSM/maps/directories) → dedupe → website discovery/crawl → contacts →
tech + quality → AI opportunity → score → offers/email → CRM export.

## How to plan
1. Parse ICP: industry, geo, filters (outdated, no chatbot, size…).
2. Choose discovery skills (parallel OK): openstreetmap/google-maps/yellow-pages;
   company-register when legal verification required.
3. Enrichment spine (usually serial per firm, parallel across firms via delegate):
   website-discovery → crawler → contact-extraction → social → tech-stack →
   website-quality → review-analyzer → lead-enrichment → ai-opportunity →
   lead-scoring → (cold-email|offer|report) → duplicate-resolver → crm-export.
4. Stop conditions: target count, coverage %, confidence floor, budget/steps.
5. Retries: empty discover → broaden geo/tags; fetch fail → mark unreachable, continue.

## Execution graph
Write `data/workflow_graph.md` listing steps, skill, agent, status, artifact paths.
Every lead should be traceable: discovery_source → evidence URLs → scores → export row.

## Delegation
Chief: plan + merge + export. Workers: discovery vs site analysis vs scoring.
Prefer few agents × many skills. Parallelize independent geos/batches with delegate.
