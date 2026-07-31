# Lead Scoring

Produce a letter grade from observed signals. Every score needs short reasons.

## Inputs (use what exists)
website_quality (0–100) · review rating/count · digital maturity (tech-stack + forms +
booking + chatbot) · ai_opportunity priority · company_size band · website age signals ·
response channels (email/phone/form/whatsapp)

## Grade rubric
- **A+**: strong site (quality≥75), clear contacts, modern stack signals, reviews≥4.3
  with volume, AND high AI opportunity (still sellable gaps) or already mature (note which)
- **A**: good site + contacts + at least one strong opportunity
- **B**: workable site or solid phone/email; moderate gaps
- **C**: weak/outdated site OR missing website but reachable; unclear fit
- **D**: no site, no contacts, dead/unreachable, or out of ICP

## Process
1. Compute component scores 0–10 (quality, reviews, maturity, opportunity, reachability).
2. Map average + gates → letter. Missing website caps at C unless phone+register strong.
3. Write `score_reasons` (3 bullets max) citing evidence fields.

## Output
lead_grade, score_total, component_json, score_reasons, scored_at.

Do not grade on vibes. If data missing, lower confidence and say what’s missing.
