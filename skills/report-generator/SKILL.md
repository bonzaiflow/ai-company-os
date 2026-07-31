# Report Generator

Produce an executive-ready lead/account report from stored evidence.

## Sections (Markdown first)
1. Executive summary (5 lines: who, score, top opportunity, ask)
2. Company profile (legal name, register, contacts, location)
3. Website analysis (quality_score, tech, strengths/issues)
4. Reviews (themes + rating if known)
5. AI opportunities + recommended offers (priority ordered)
6. Lead grade + scoring reasons
7. Evidence index (URLs / file paths)
8. Next actions

## Formats
- Always write `out/reports/<domain-or-batch>.md`
- Optional HTML: simple static page mirroring the MD (`out/reports/….html`)
- PDF: only if the environment clearly supports it; otherwise MD+HTML and note PDF skipped
- Screenshots: not available without a screenshot tool — omit or placeholder path

## Rules
Numbers and quotes only from DB/files. Label estimates. Batch mode: one summary MD
plus per-grade counts. Keep under ~150 lines per firm report unless asked for deep dive.
