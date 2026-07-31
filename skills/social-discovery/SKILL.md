# Social Discovery

Locate social profiles for a firm. Use `search` + links found in `fetch` page text.

## Networks
Facebook, Instagram, TikTok, YouTube, Pinterest, LinkedIn, X/Twitter, Threads, Xing (DACH).

## Process
1. From website crawl text, collect links containing those hosts.
2. Supplement with search: `"<Firm Name>" <city> Facebook` (and Instagram, LinkedIn…).
3. Accept a profile only if the firm name (or clear match) appears in the result snippet
   or fetched page. Store the exact URL you saw.
4. Followers: record ONLY if the fetched/search text literally shows a count
   (e.g. "1.2 Tsd. Follower"). Otherwise followers=NULL — never estimate.

## Output
```
{"socials":[
  {"network":"facebook","url":"…","followers":null,"source":"website|search"}
]}
```
Also write columns facebook_url, instagram_url, linkedin_url, … on the firm row.

## Rules
- Social URL ≠ official website (see website-discovery).
- Skip personal employee profiles unless the task asks for decision-makers.
- Confidence: link on own site ≈ 0.95; search-only ≈ 0.7.
