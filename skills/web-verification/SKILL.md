# Web Verification (anti-hallucination)

Rules for URLs and email addresses — the difference between data and fiction:

1. An email address may ONLY be recorded if you saw it in the text returned by a `fetch`
   in THIS task. Copy it character by character. Never construct emails like
   info@<company>.de from the company name — that is hallucination.
2. Always store WHERE you found it: an `email_source` column with the exact URL whose
   fetched text contained the email.
3. Where to look: fetch the site, then its contact page. German sites list emails on
   /impressum or /kontakt (legally required!) — try https://<domain>/impressum first.
4. To VERIFY a record someone else produced: fetch its `email_source` URL and check the
   email string literally appears in the returned text. Mark `verified=1` only then;
   otherwise `verified=0`. A fetch error means NOT verified.
5. If a page shows no email after checking site + impressum + kontakt, record NULL and
   say so. "None found" is a good result; an invented address is a failure.
6. Emails in fetched text may be obfuscated ("info (at) firma.de") — normalize to
   info@firma.de and note the obfuscation in your result.
