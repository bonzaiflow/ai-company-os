# Overpass API — Querying, Planning & Handling Responses

Deep reference for building Overpass QL queries that return REAL OpenStreetMap
data (never invented). In ai-company-os you run a query by passing it to the `discover`
tool as `overpassQl`; the owner can prototype the same query on
https://overpass-turbo.eu. This skill is about writing GOOD queries and dealing
with what comes back. (For the ai-company-os tool mechanics + import/dedup, see the
overpass-osm skill.)

## 1. Anatomy of a query

```
[out:json][timeout:60];        // settings: always json, always a timeout
area["name"="Bayern"]["admin_level"="4"]->.a;   // optional: define a search area
(                              // a group (union) of statements
  nwr["office"="employment_agency"](area.a);
  nwr["office"="recruitment"](area.a);
);
out tags 2000;                 // output: tags only, cap the element count
```

- `[out:json]` — REQUIRED (ai-company-os parses JSON; without it you get XML and get 0 rows).
- `[timeout:60]` — server-side seconds; raise to 120–180 for big areas, but a
  bigger timeout means a slower response and more chance of a 504.
- `nwr` = **n**odes + **w**ays + **r**elations. A business can be any of these, so
  almost always use `nwr` (not bare `node`).
- `out tags <N>;` — return only tags (no geometry — smaller, faster) and cap at N
  elements. `out tags 2000;` is a good default; `out center;` if you also need coords.

## 2. Selecting the right tags (this decides WHAT you get)

Pick tags by what the business actually is. Wrong tags = wrong or empty results.

| You want | OSM selector |
|---|---|
| recruitment / staffing | `["office"~"employment_agency|recruitment|temp_agency"]` |
| trades / handwerk | `["craft"~"plumber|hvac|electrician|roofer|carpenter|painter|tiler"]` |
| professional offices | `["office"~"lawyer|accountant|architect|estate_agent|it|consulting|insurance|company"]` |
| shops | `["shop"="bakery"]` … (any `shop=` value) |
| food / hospitality | `["amenity"~"restaurant|cafe|bar|fast_food"]` |
| healthcare | `["amenity"~"dentist|doctors|pharmacy|clinic"]` or `["healthcare"]` |

- Exact match `["k"="v"]`; regex over values `["k"~"a|b|c"]`; key-exists `["office"]`;
  negation `["k"!="v"]`. Regex is case-sensitive — add `,i`: `["name"~"gmbh",i]`.
- Combine tags on one selector = AND: `nwr["office"="company"]["name"~"personal",i](area.a);`
- Union of selectors in `( … );` = OR (different business types in one query).
- **Only trust `name`d elements.** Many nodes are untagged; ai-company-os already drops
  rows without a `name`.

## 3. Scoping: area vs bbox (this decides HOW MUCH you get)

- **Named area** — most reliable for admin regions:
  `area["name"="München"]["admin_level"~"6|8"]->.a; nwr[...](area.a);`
  admin_level: 4 = Bundesland, 6 = Kreis/Bezirk, 8 = city/Gemeinde. Ambiguous names
  (many "Neustadt") → add `["boundary"="administrative"]` and a higher level, or use bbox.
- **Bounding box** — `(south,west,north,east)` after the selector:
  `nwr["shop"="bakery"](48.06,11.36,48.25,11.72);` — exact, no name lookup, good for a city.
- **Whole country is too big** in one shot — split by Bundesland/Kanton/Bundesländer
  and query each (ai-company-os's discover auto-sweep already does city-by-city for you).

## 4. Planning a query before you run it

1. **Name the target precisely**: which business kind (→ tag), which region (→ area/bbox),
   roughly how many you expect. If you can't name the tag, don't query — you'll get junk.
2. **Size it**: a Bundesland of one office type ≈ hundreds–low-thousands. If you expect
   >~5000, split the region or you'll hit the timeout. Set `out tags` to a bit above
   your expectation.
3. **Prototype on overpass-turbo.eu**: paste, Run, eyeball the map + the data view.
   Adjust tags until the results are what you want. THEN pass the exact text as `overpassQl`.
4. **Budget the server**: one big query is worse than several medium ones — mirrors
   rate-limit. Prefer many area/city queries over one country-wide monster.

## 5. Handling the response

Overpass returns `{ "elements": [ { "type","id","tags":{...} }, ... ] }`.
The useful data is in `tags`:
- name: `tags.name`
- website: `tags.website` OR `tags["contact:website"]` (also sometimes `tags.url`)
- email: `tags.email` OR `tags["contact:email"]`
- phone: `tags.phone` OR `tags["contact:phone"]`
- city: `tags["addr:city"]`
(ai-company-os's discover/importdata extract exactly these automatically.)

**Response problems and what to do:**
- **Empty `elements`** → tags too narrow, wrong region name, or area lookup failed.
  Loosen the tag (regex/union), verify the area name, or switch to a bbox.
- **HTML/XML instead of JSON** (starts with `<`) → rate-limited or the query erred.
  Wait ~30s and retry, or use the other mirror. ai-company-os already tries a second mirror.
- **HTTP 429 (Too Many Requests)** → you're querying too fast. Space calls out
  (ai-company-os pauses between cities); back off ~30–60s.
- **HTTP 504 / timeout** → query too heavy. Lower the area size, raise `[timeout:]`
  modestly, or split the region.
- **Truncated at your `out` cap** → you hit N; the region has more. Split it and
  re-query the parts.
- **Duplicates across queries** are expected when regions overlap — ai-company-os dedups by
  website domain + name|city on insert, so overlapping sweeps are safe.

## 6. Worked examples

Recruitment firms in a whole Bundesland (private + agencies):
```
[out:json][timeout:120];
area["name"="Nordrhein-Westfalen"]["admin_level"="4"]->.a;
(nwr["office"~"employment_agency|recruitment|temp_agency"](area.a););
out tags 3000;
```

Bakeries in a city by bbox:
```
[out:json][timeout:60];
nwr["shop"="bakery"](50.90,6.85,51.00,7.02);
out tags 1000;
```

Law firms whose name contains "Partner", one city:
```
[out:json][timeout:60];
area["name"="Hamburg"]["admin_level"="4"]->.a;
nwr["office"="lawyer"]["name"~"partner",i](area.a);
out tags 1000;
```

Then in ai-company-os:
`{"action":"tool","tool":"discover","args":{"overpassQl":"<the query, one line>","into":"firms","segment":"recruitment","country":"DE"}}`
