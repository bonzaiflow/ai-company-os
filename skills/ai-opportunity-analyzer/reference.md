# AI opportunity → product map

Use only when the gap was checked against crawl/fetch evidence.

| Gap id | How to detect | Product |
|--------|---------------|---------|
| no_chatbot | no chat widget strings, no Intercom/HubSpot chat/tidio/crisp | AI Receptionist |
| slow_response | review themes: no callback, late reply | AI Receptionist + SLA |
| no_booking | "Termin telefonisch", no Calendly/Buchungstool | Booking Bot |
| no_faq | no FAQ page in crawl | Knowledge Base |
| no_lead_form | no form on kontakt/home | Lead capture |
| no_quote_flow | only "Angebot anfordern" mailto | Quote assistant |
| weak_site | quality_score < 50 or unreachable mobile signals | Website redesign |
| no_i18n | single language, no hreflang | Multilingual |
| no_analytics | no GA/gtag/Matomo/Meta pixel | Tracking basics |
| no_crm_hint | no HubSpot/Salesforce scripts | CRM + sync |

## Estimate bands (label as estimates)
- AI Receptionist: 5–20 h/mo saved if phone-heavy + missed-call reviews
- Booking Bot: 3–12 h/mo if manual Termin
- Redesign: revenue upside only if quality_score < 40 AND competitors implied stronger — keep wide bands

Never present estimates as guaranteed ROI.
