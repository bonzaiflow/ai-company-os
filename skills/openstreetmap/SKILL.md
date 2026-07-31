# OpenStreetMap / Overpass

Find businesses Google often misses: rural firms, craftsmen, clubs, NGOs, municipalities.
Primary tool: `discover` (writes real OSM rows — nothing invented).

## Prefer built-in discover
```
{"action":"tool","tool":"discover","args":{
  "cities":["Passau","Rosenheim","Landshut"],
  "trades":["Dachdecker"],"into":"osm_raw","country":"DE","segment":"Dachdecker"}}
```
Omit `trades` to sweep common handwerk crafts. Auto-sweep: omit `cities` for ~150 DACH cities.

## Custom Overpass QL (gaps / rare tags)
```
{"action":"tool","tool":"discover","args":{
  "overpassQl":"[out:json][timeout:60];area[\"name\"=\"Bayern\"][\"admin_level\"=\"4\"]->.a;(nwr[\"craft\"=\"roofer\"](area.a);nwr[\"craft\"=\"carpenter\"](area.a););out tags 2000;",
  "into":"osm_raw","country":"DE","segment":"handwerk"}}
```
Must start with `[out:json]`. Prototype on https://overpass-turbo.eu first.

## Useful tag families
- craft=* (roofer, electrician, plumber, carpenter, painter, tiler, hvac…)
- office=* (company, consulting, estate_agent, lawyer, architect…)
- shop=*, amenity=*, building=* (use sparingly — noisy)

## Extract / store
OSM id (type/id), name, website|contact:website, email|contact:email,
phone|contact:phone, addr:*, lat/lon if present. Tag `discovery_source='osm'`.
Dedup is built into discover. See also overpass-api / overpass-osm skills.
