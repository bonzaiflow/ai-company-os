# Website Discovery

Locate the official company domain when Maps/directories give social links or nothing.

## Process
1. Candidates from prior fields: website, facebook URL, name+city.
2. Search: `"\"<Exact Name>\" <city>"`, `"<Name> GmbH"`, `"<Name> Impressum"`.
3. Accept a domain only if:
   - It appears in search/fetch results, AND
   - It is not a directory/social (facebook, linkedin, gelbeseiten, 11880, yelp, xing).
4. Fetch `https://<domain>` then prefer HTTPS. Follow obvious redirects mentioned in text;
   record `canonical_domain` (registrable domain, lowercase, no www).
5. German/AT/CH sites: confirm via /impressum — company name should match.

## Output
```
official_website, canonical_domain, https (0|1), redirect_notes, discovery_method,
confidence
```
Methods: maps_field | search | impressum | social_about_link.

## Rules
- Never guess `firma.de` from the company name.
- facebook.com/… is NOT official_website — store under socials; keep hunting.
- If unresolved after 3–5 searches: `website=NULL`, `website_status='unresolved'`.
