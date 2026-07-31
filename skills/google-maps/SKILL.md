# Google Maps Discovery

Highest-quality local discovery via Maps-style search. ai-company-os has no Maps scrape API —
use `search` + `discover` and treat results as Maps-like leads.

## Inputs
`industry`, `location`, `country` (DE|AT|CH), optional `max_results`.

## Process
1. Search several angles (DE + EN):
   `{"action":"tool","tool":"search","args":{"query":"Dachdecker München"}}`
   Also try: `"Dachdecker München Telefon"`, `"roofer Munich"`, `"<industry> <city> GmbH"`.
2. Prefer company `.de/.at/.ch` domains. Skip facebook, linkedin, yelp, gelbeseiten,
   goyellow, 11880, maps.google — those are sources, not the firm website.
3. For bulk volume, use OSM (same ICP):
   `{"action":"tool","tool":"discover","args":{"cities":["München","Augsburg"],"trades":["Dachdecker"],"into":"maps_raw","country":"DE","segment":"Dachdecker"}}`
4. Insert immediately with `discovery_source='google-maps-search'` or `'osm-maps'`.
5. Store when seen: name, website, phone, city, country. Never invent rating/reviews —
   only record if the fetched/search text literally showed them.

## Output row shape
name, category, address, phone, website, rating?, reviews?, lat?, lon?,
business_status?, discovery_source, confidence (0.7 search / 0.95 discover).

## Confidence
Maps-like search hits ≈ 0.85–0.99 when name+city+phone/website align.
Never invent coordinates or review counts.
