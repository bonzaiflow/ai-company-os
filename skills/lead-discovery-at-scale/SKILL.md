# Lead Discovery at Scale

How to build a large list of REAL businesses (hundreds to thousands) without hallucinating.

## The tool that scales: `discover`

`discover` pulls REAL local businesses from OpenStreetMap and writes them straight into a
database table — name, website, email, phone, city — deduped, nothing invented (you never
copy anything by hand). One city yields ~100-270 craft businesses.

```
{"action":"tool","tool":"discover","args":{
  "cities":["München","Augsburg","Nürnberg","Regensburg","Ingolstadt", ...],
  "trades":["SHK","Elektro","Dachdecker"],
  "into":"maps_raw", "db":"main.db", "segment":"SHK", "country":"DE"}}
```

`trades` map to OSM crafts (SHK→plumber/hvac, Elektro→electrician, Dachdecker→roofer,
Tischler/Schreiner→carpenter, Maler→painter, Fliesen→tiler, …); omit `trades` to sweep all
handwerk crafts. It returns how many NEW rows were added, how many carried an email, and the
table total. (Set `queries:[...]` instead of `cities` to fall back to plain web search.)

## How to reach a big target (e.g. 10000)

One city yields ~100-270 businesses, so breadth across CITIES is the lever. Each call: pass
10-20 cities; next call, the NEXT 10-20 cities. Sweep the grid:

1. **Trades** (your ICP): SHK / Sanitär-Heizung, Elektro/Elektriker, Dachdecker, Bau/Ausbau,
   Tischlerei/Schreinerei, Maler, Fliesenleger, Zimmerei, Garten-/Landschaftsbau.
2. **Cities** — walk many, do NOT reuse. DACH has hundreds. Work through, e.g.:
   München, Berlin, Hamburg, Köln, Frankfurt, Stuttgart, Düsseldorf, Dortmund, Essen, Leipzig,
   Bremen, Dresden, Hannover, Nürnberg, Duisburg, Bochum, Wuppertal, Bielefeld, Bonn, Münster,
   Karlsruhe, Mannheim, Augsburg, Wiesbaden, Mönchengladbach, Gelsenkirchen, Aachen, Braunschweig,
   Kiel, Chemnitz, Halle, Magdeburg, Freiburg, Krefeld, Mainz, Lübeck, Erfurt, Rostock, Kassel,
   Potsdam, Saarbrücken, Hagen, Ludwigshafen, Oldenburg, Osnabrück, Heidelberg, Regensburg,
   Ingolstadt, Würzburg, Ulm, Fürth, Koblenz, Bremerhaven, Reutlingen, Trier … then Austria
   (Wien, Graz, Linz, Salzburg, Innsbruck, Klagenfurt) and Switzerland (Zürich, Genf, Basel, Bern,
   Lausanne, Winterthur, Luzern, St. Gallen).
3. **Each `discover` call: one trade × ~15 cities** (15 queries). That adds ~150-200 new rows.
   Next call: same trade × the next 15 cities, or the next trade. Set `country` DE/AT/CH.

Keep calling `discover` with fresh city/trade combinations. INSERT OR IGNORE dedup means
overlap is harmless. The engine re-checks the row count and keeps you going until the target
is hit or new rows stop appearing (region genuinely exhausted — report that honestly).

## Order of work
1. `discover` raw businesses into `maps_raw` until the raw target is met.
2. Enrich (emails, phone) from the websites — see the enrichment/web-verification skills.
3. Score against the ICP and export the qualified subset.
