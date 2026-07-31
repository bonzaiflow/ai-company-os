# Overpass / OpenStreetMap Queries

OpenStreetMap is the ground-truth source for REAL local businesses (name, website, email,
phone — verbatim, nothing invented). You reach it three ways, from easiest to most powerful:

## 1. Easiest: `discover` with trades/segment (no query writing)

```
{"action":"tool","tool":"discover","args":{"segment":"recruitment","into":"firms","country":"DE"}}
```
Auto-sweeps ~150 DACH cities with the right OSM tags. See the lead-discovery-at-scale skill.

## 2. Powerful: `discover` with a raw Overpass QL query

When the built-in categories don't fit (different business type, a specific region,
extra tags), write Overpass QL yourself and pass it via `overpassQl`:

```
{"action":"tool","tool":"discover","args":{
  "overpassQl":"[out:json][timeout:60];area[\"name\"=\"Bayern\"][\"admin_level\"=\"4\"]->.a;(nwr[\"office\"=\"employment_agency\"](area.a);nwr[\"office\"=\"recruitment\"](area.a););out tags 2000;",
  "into":"firms","segment":"recruitment","country":"DE"}}
```

Overpass QL essentials:
- Always start with `[out:json][timeout:60];` and end with `out tags <max>;`
- `nwr[...]` = nodes+ways+relations. Filter by tags: `nwr["craft"="electrician"]`,
  regex: `nwr["craft"~"plumber|hvac"]`
- Area search: `area["name"="München"]->.a; nwr["shop"="bakery"](area.a);`
  or bbox: `nwr["office"="lawyer"](48.06,11.36,48.25,11.72);` (south,west,north,east)
- Useful tags by business type: recruitment → `office=employment_agency|recruitment|temp_agency`;
  handwerk → `craft=plumber|hvac|electrician|roofer|carpenter|painter|tiler`;
  offices → `office=lawyer|accountant|architect|estate_agent|it|consulting|insurance`;
  shops → `shop=<anything>`; healthcare → `amenity=dentist|doctors|pharmacy|clinic`
- Contact fields live in `website|contact:website`, `email|contact:email`,
  `phone|contact:phone`, city in `addr:city` — discover extracts these automatically.
- TEST the query first on https://overpass-turbo.eu (paste, Run, inspect the map),
  then pass the exact same text as `overpassQl`.

## 3. Owner data: import an overpass-turbo.eu export with `importdata`

The owner can run queries on overpass-turbo.eu themselves and upload the export
(JSON, GeoJSON or CSV) through the chat. It lands in `data/uploads/`. Import it:

```
{"action":"tool","tool":"importdata","args":{"path":"data/uploads/export.json","into":"firms","segment":"recruitment","country":"DE"}}
```

## Dedup rules (built in — but know them)

`discover` and `importdata` skip a row when its website DOMAIN or its
lower(name)|city pair already exists in the table — so re-imports and overlapping
sweeps are safe. To clean a table that already has duplicates, keep the richest row:

```sql
DELETE FROM firms WHERE rowid NOT IN (
  SELECT rowid FROM (
    SELECT rowid, ROW_NUMBER() OVER (
      PARTITION BY lower(name), COALESCE(city,'')
      ORDER BY (email IS NOT NULL) DESC, (website IS NOT NULL) DESC, rowid
    ) rn FROM firms
  ) WHERE rn = 1
);
```

Report row counts before/after any dedup in your result.
