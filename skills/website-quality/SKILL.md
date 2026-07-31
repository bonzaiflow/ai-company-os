# Website Quality Audit

Score digital quality 0–100 from fetched evidence only. No Lighthouse API — infer from
page text, headers hints in text, and crawl success/failure.

## Check groups (weight roughly equal)
1. **Performance proxies**: heavy image mentions without lazy-load hints; very long HTML;
   repeated tracking scripts → lower. Fast/simple static → higher. Note uncertainty.
2. **SEO**: title-like heading, meta description phrases, schema.org/JSON-LD strings,
   OpenGraph (og:), robots/sitemap links mentioned.
3. **Accessibility proxies**: alt= absence complaints hard in stripped text — check whether
   images are described; look for skip/nav landmarks; forms without labels.
4. **UX / trust**: mobile mentions, visible contact, Impressum present (DACH must),
   broken fetches (404/unreachable), dead internal links you tried, booking/chat widgets.

## Process
1. Use crawl notes under `data/sites/<domain>/`.
2. Score each group 0–25, sum → `quality_score` 0–100.
3. List `quality_issues[]` and `quality_strengths[]` with evidence snippets.

## Output
quality_score, issues[], strengths[], impressum_ok (0|1), contact_visible (0|1),
https_ok (0|1).

Be honest: without real perf tools, mark performance as `estimated`. See reference.md.
