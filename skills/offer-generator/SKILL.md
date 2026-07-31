# Offer Generator

Turn observed gaps into a concrete offer pack for a firm (or segment).

## Mapping (gap → offer)
| Evidence gap | Offer |
|---|---|
| No chatbot / slow replies / review "no callback" | AI Receptionist |
| Manual Termin / anrufen only | Booking Bot |
| No FAQ / repetitive questions | Knowledge Base / FAQ bot |
| Weak/outdated site, poor quality_score | Website redesign |
| No lead form | Lead capture + CRM sync |
| No online quote | Quote assistant |
| No translations, DACH cross-border | Multilingual site/chat |
| No analytics / pixel | Tracking & funnel basics |

## Process
1. Read ai-opportunity + review + quality outputs.
2. Pick 1–3 offers max, priority-ordered.
3. For each: problem (with evidence), solution, suggested scope (S/M/L),
   why-now (review/quality trigger).
4. Do not pitch products without a matching gap.

## Output
`out/offers/<domain>.md` or `offers` table:
firm_id, offers_json, primary_offer, evidence_refs.

Keep language factual and tied to their site — this feeds cold-email and reports.
