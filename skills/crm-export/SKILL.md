# CRM Export

Export qualified leads to portable formats. Native: CSV / JSON / SQLite. CRM APIs
(HubSpot, Salesforce, Pipedrive, Notion) require credentials — if unavailable, export
CSV/JSON shaped for their import and document the mapping.

## Standard columns
name, legal_name, country, region, city, address, website, email, phone,
registration_number, discovery_sources, lead_grade, opportunity_score,
top_opportunity, quality_score, tech_summary, socials, email_source, notes,
canonical_id

## Process
1. Query canonical firms only (`is_duplicate=0` or canonical_id IS NULL).
2. Gate: skip rows missing name; prefer rows with website or phone.
3. Write:
   - `out/crm_export.csv` (UTF-8, header row, comma-separated, quote fields with commas)
   - `out/crm_export.json` (array of objects)
   - Optional Excel: CSV is enough unless xlsx tooling exists
4. Postgres/HubSpot/Salesforce/Pipedrive/Notion: if no API keys in env/config,
   write `out/crm_import_notes.md` with field mapping + the CSV path — do not fake syncs.

## Rules
Every email in the export must still have email_source in DB.
Report row counts exported vs skipped + file paths in your completion result.
