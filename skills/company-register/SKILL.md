# Company Register (legal verification)

Verify legal identity for DE / AT / CH. Use `search` + `fetch`. Never invent registration
numbers, directors, or VAT IDs.

## Country sources
- **DE**: Handelsregister / Unternehmensregister / northdata / firmenwissen snippets
  Query: `"<Firm>" Handelsregister` or `"<Firm>" HRB`
- **AT**: Firmenbuch / FirmenABC / WKO
  Query: `"<Firm>" Firmenbuch` or `"<Firm>" FN `
- **CH**: ZEFIX / commercial register
  Query: `"<Firm>" site:zefix.ch` or `"<Firm>" CHE-`

## Extract (only if literally present in search/fetch text)
legal_name, registration_number (HRB/HRA/FN/CHE-…), vat_id (DE/AT/CH USt-IdNr),
managing_director, status (active/liquidated/unknown), foundation_year, legal_form
(GmbH, AG, e.U., GmbH & Co. KG, …), register_source_url.

## Process
1. Search legal identifiers for the firm + city.
2. Fetch the most specific public page (register snippet, impressum, northdata-like page).
3. Copy values character-by-character; store `register_source_url`.
4. If nothing found: set fields NULL and `register_status='not_found'` — that is success.

## Confidence
Exact HRB/FN/CHE match ≈ 0.95. Name-only match without number ≈ 0.5 — do not claim verified.
Impressum legal_form + Sitz often complements register data.
