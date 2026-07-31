# Cold Email Generator

Write outreach from the full company profile. **Never hallucinate.** Every claim must
point to discovered evidence (URL, review quote, or stored signal).

## Input
Firm row + contacts + site_signals + opportunities + review themes + lead_grade.

## Output per lead
- subject (≤60 chars, specific, no clickbait)
- first_sentence (personalized observation with evidence)
- pain_point (tied to a real gap)
- offer (one concrete product matching the gap)
- call_to_action (low friction: reply / 15-min call)
- evidence_refs[] (field or URL backing each claim)

## Rules
1. If you cannot cite evidence for a claim, delete the claim.
2. No fake metrics ("save 40%") unless the opportunity analyzer labeled an estimate —
   then phrase as possibility, not fact.
3. Match locale: DE firms → German email; AT/CH respect local spelling; EN only if site is EN.
4. Do not claim you visited in person or spoke to staff.
5. One email = one primary pain. Save secondary gaps for follow-ups.

## Storage
`out/cold_emails/<canonical_domain>.md` and/or table `outreach_drafts`.
Subject+body must be usable as-is. See also offer-generator.
