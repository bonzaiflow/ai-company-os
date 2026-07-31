# Web Research

How to research on the web with the `fetch` tool:

1. Fetch a page: `{"action":"tool","tool":"fetch","args":{"url":"https://example.com"}}`.
   You get plain text (HTML stripped, truncated). Look for names, addresses, emails, facts.
2. Follow up: if the text mentions a more specific page (contact, about, pricing), fetch that URL next.
3. Record findings immediately with `filesystem` append into `data/research-notes.md` — one line per fact with its source URL.
4. Never invent data. If a page has no answer, say so in your notes and move on.
5. 3-5 fetches are usually enough. Then complete with a summary of what you found and where you stored it.
