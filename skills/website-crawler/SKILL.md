# Website Crawler

Download key pages of a firm site into Markdown evidence. Tool: `fetch` (HTML→text).
No real browser — crawl by URL discovery from homepage text.

## Pages to cover (in order)
Homepage → Impressum → Kontakt/Contact → About/Über uns → Leistungen/Services →
Projekte/Referenzen → Produkte → Jobs/Karriere → FAQ → Blog → Privacy/Datenschutz.

## Process
1. Fetch homepage. Append to `data/sites/<canonical_domain>/website.md`:
   `## <url>\n<source>…</source>\n` + truncated page text.
2. From homepage text, collect internal links matching the list above
   (/impressum, /kontakt, /about, /leistungen, /jobs, …). Fetch each once.
3. Cap at ~12 fetches per firm. Mark missing pages as `not_found`.
4. Never invent page content. If fetch fails: note `unreachable: <url>`.

## Output
`data/sites/<domain>/website.md` plus optional index row:
domain, pages_fetched, pages_missing, crawled_at.

## Tips
- Always try `/impressum` and `/kontakt` on DACH sites (legal contact data).
- Keep one file per domain so enrichment/scoring skills can re-read evidence.
- Prefer writing facts into SQLite after crawl; markdown is the audit trail.
