# Local Business Research

How to build a list of local businesses (the "maps scraping" workflow) with the `search` tool:

1. Search several angles, e.g. for recruitment firms in Munich:
   `{"action":"tool","tool":"search","args":{"query":"Personalberatung München"}}`
   then "recruitment agency Munich", "Headhunter München", "executive search München".
2. Search results contain REAL urls — company websites and directories. Only company
   websites count as a firm's `website` (skip clutch.co, yelp, linkedin, maps links).
3. Record every candidate immediately with sqlite, batching inserts:
   `INSERT OR IGNORE INTO firms (name, website) VALUES ('Pape Consulting','https://www.pape.de/'), ('IRC GmbH','https://www.ircgmbh.de/')`
4. NEVER write a website you did not see in a search result or fetched page. No guessing
   domains from company names — that is how hallucinated URLs happen.
5. Keep searching with new query variations until you have the required number of firms,
   then complete with the count and the table name.
