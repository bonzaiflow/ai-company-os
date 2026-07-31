# Contact Extraction

Extract every contact channel from crawled/fetched pages. Anti-hallucination:
an email/phone may ONLY be stored if it appeared in fetch text in THIS task.

## Find
- Emails: `name@domain` and obfuscations `info (at) firma.de` → normalize to info@firma.de
- Phones / fax: keep as shown; prefer E.164 when unambiguous
- WhatsApp / Telegram / Messenger links if present
- Contact form URLs (pages with forms, /kontakt, form action hints)

## Where to look (DACH)
1. /impressum  2. /kontakt /contact  3. homepage footer  4. /about

## Output JSON shape (also store in SQLite)
```
{"emails":[{"value":"…","source_url":"…"}],
 "phones":[{"value":"…","type":"phone|fax","source_url":"…"}],
 "messaging":[{"type":"whatsapp|telegram|messenger","value":"…","source_url":"…"}],
 "contact_forms":[{"url":"…"}]}
```

## Rules
1. Copy character-by-character; always set `email_source` / `source_url`.
2. Never construct info@<domain> from the domain alone.
3. No email after impressum+kontakt+home → emails=[] is a valid result.
4. De-dupe case-insensitively; keep the best source_url (impressum > kontakt > home).
See also web-verification.
