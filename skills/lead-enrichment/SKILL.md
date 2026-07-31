# Lead Enrichment

Fill missing firm fields from evidence. Never invent employees, revenue, or founded year.

## Enrichment targets
employees / company_size band · revenue band · industry / NACE-like label · founded ·
languages · regions_served · opening_hours · legal_form · managing_director

## Sources (priority)
1. Impressum / about / register fetch text
2. OSM tags / directory snippets already stored
3. Search: `"<Firm>" Mitarbeiter`, `"<Firm>" gegründet`, `"<Firm>" Umsatz`
4. Career pages (hiring volume → size hint only as `size_signal`, not fact)

## Process
1. Select rows with NULL gaps you can fill.
2. Fetch/search; copy only literal values; set `<field>_source` URL.
3. For fuzzy bands (e.g. "10–49 employees" from text "über 30 Mitarbeitende"):
   store band + evidence; confidence ≤0.7.
4. Opening hours: copy string as shown; don’t reformat into inventing weekday slots.

## Output columns
employees, employee_band, revenue_band, industry, founded_year, languages,
regions_served, opening_hours, enrichment_notes, enrichment_confidence.

If unknown after honest effort: leave NULL. Incomplete > fabricated.
