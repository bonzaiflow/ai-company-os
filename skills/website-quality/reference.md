# Quality score rubric (estimated)

Each group 0–25; sum = quality_score 0–100. Mark `performance=estimated`.

## Performance proxies (0–25)
- 20–25: short pages, few trackers, HTTPS, fast enough to fetch
- 10–19: heavy pages / many scripts
- 0–9: multiple timeouts, huge text, obvious bloat

## SEO (0–25)
+ title/H1 clarity, meta description, OG tags, schema.org, sitemap/robots mention
− missing all of the above

## Accessibility proxies (0–25)
+ structural headings, labeled form fields visible in text, contact not image-only
− impressum missing (DACH), no text contact

## UX / trust (0–25)
+ impressum + kontakt ok, clear nav targets, CTA visible, no broken key URLs
− 404s on impressum/kontakt, no phone/email, only social contact

Record issues as `{code, detail, evidence}`.
