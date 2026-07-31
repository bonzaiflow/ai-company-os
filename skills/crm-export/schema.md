# Suggested SQLite schema (adapt to task)

```sql
CREATE TABLE IF NOT EXISTS firms (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  legal_name TEXT,
  category TEXT,
  address TEXT,
  city TEXT,
  region TEXT,
  country TEXT,
  phone TEXT,
  website TEXT,
  canonical_domain TEXT,
  email TEXT,
  email_source TEXT,
  registration_number TEXT,
  legal_form TEXT,
  lat REAL, lon REAL,
  rating REAL, review_count INTEGER,
  discovery_source TEXT,
  sources_json TEXT,
  canonical_id INTEGER,
  is_duplicate INTEGER DEFAULT 0,
  lead_grade TEXT,
  quality_score INTEGER,
  opportunity_score INTEGER,
  top_opportunity TEXT,
  tech_json TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY,
  firm_id INTEGER,
  kind TEXT, -- email|phone|fax|whatsapp|form
  value TEXT,
  source_url TEXT
);

CREATE TABLE IF NOT EXISTS site_signals (
  firm_id INTEGER PRIMARY KEY,
  tech_json TEXT,
  quality_score INTEGER,
  quality_issues TEXT,
  has_chatbot INTEGER,
  has_booking INTEGER,
  has_faq INTEGER,
  impressum_ok INTEGER,
  site_status TEXT
);

CREATE TABLE IF NOT EXISTS lead_scores (
  firm_id INTEGER PRIMARY KEY,
  lead_grade TEXT,
  score_total REAL,
  component_json TEXT,
  score_reasons TEXT,
  scored_at TEXT
);
```
