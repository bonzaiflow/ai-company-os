# Yellow Pages / Directories

Commercial directory discovery for DACH. Use `search` — do not treat directory domains
as the firm’s website.

## Sources (query them, then find the real site)
- DE: Gelbe Seiten, Das Örtliche, 11880, GoYellow
- AT: Herold
- CH: local.ch, search.ch
- Also: WKO Firmen A–Z (AT chamber), industry associations

## Process
1. Search: `"Dachdecker München site:gelbeseiten.de"` or `"<industry> <city> Herold"`.
2. From snippets, capture name, city, phone, category. If a company URL appears, keep it.
3. If only a directory URL: search `"\"<Exact Firm Name>\" <city>"` and take the first
   real company domain (not facebook/linkedin/directory).
4. Insert with `discovery_source='yellow-pages'` (or herold / local-ch / wko).
5. Never store gelbeseiten.de / herold.at / 11880.com as `website`.

## Extract
name, website (official only), email (only if seen on a fetched page), phone, address,
categories[], directory_url (optional evidence).

## Rules
- Directory hit alone → confidence ~0.7; + official website → ~0.9.
- Phone from directory is OK if the snippet showed it literally.
- Batch INSERT OR IGNORE; verify COUNT at the end.
