# Technology Detector

Detect site technologies from `fetch` text (HTML stripped — you see generator meta,
script hosts, classnames, and visible strings). No invented stacks.

## Signals to look for
CMS: WordPress (wp-content, wp-json), Shopify, TYPO3, Joomla, Wix, Squarespace
Frameworks: Next.js, Nuxt, React, Vue, Angular, Symfony, Laravel
CDN/security: Cloudflare
Analytics/pixels: Google Analytics/gtag/G-, Meta Pixel/fbq, HubSpot, Matomo, Cookiebot,
Google Tag Manager

## Process
1. Fetch homepage (and optionally one more page).
2. For each hit, record `{tech, evidence, confidence}` where evidence is a short
   substring you actually saw (e.g. "wp-content", "cdn.shopify.com", "_next/static").
3. Version: only if a version string appears (generator meta). Else version=null.

## Output
```
{"technologies":[{"name":"WordPress","version":null,"confidence":0.9,"evidence":"wp-content"}]}
```
Store as JSON in `site_signals.tech_json` or normalized rows.

## Confidence guide
Exact path/host marker ≥0.85; weak keyword alone ≤0.5 (label uncertain).
If nothing matches: technologies=[] — do not guess "custom HTML".
