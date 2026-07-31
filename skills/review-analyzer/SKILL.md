# Review Analyzer

Cluster public review themes (complaints + strengths). ai-company-os cannot scrape Google Maps
UI — use `search` snippets and any review text found via `fetch` on known URLs.

## Sources
- Search: `"<Firm>" Bewertung`, `"<Firm>" Google Reviews`, `"<Firm>" Erfahrungen`
- Facebook recommendations if social-discovery found a page
- Trust sites only as snippets (never invent stars)

## Process
1. Collect review sentences you literally saw (quote them).
2. Cluster complaints into themes, e.g.: late responses, no callback, long waiting time,
   expensive, poor communication, no-show, quality issues.
3. Cluster strengths: punctual, friendly, fair price, clean work, good advice.
4. Record rating/count ONLY when the text shows them (e.g. "4,7 / 318").

## Output
```
{"rating":4.7,"review_count":318,"source":"search-snippet",
 "complaint_themes":[{"theme":"no_callback","examples":["…"],"count":3}],
 "strength_themes":[{"theme":"friendly","examples":["…"],"count":5}],
 "outreach_hooks":["Mentions slow callbacks — offer AI receptionist / SLA"]}
```

## Rules
If no review text found: themes=[], rating=null. Do not fabricate reviews.
Use themes as evidence for cold-email / offer skills — quote, don’t paraphrase as fact.
