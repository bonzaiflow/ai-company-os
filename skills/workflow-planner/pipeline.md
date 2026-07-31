# Default DACH lead pipeline

```
goal
  ├─ parallel discovery
  │    ├─ openstreetmap / discover
  │    ├─ google-maps (search)
  │    ├─ yellow-pages (search)
  │    └─ company-register (sample / high-value)
  ├─ duplicate-resolver
  ├─ per-firm enrichment (batch via delegate)
  │    ├─ website-discovery
  │    ├─ website-crawler
  │    ├─ contact-extraction
  │    ├─ social-discovery
  │    ├─ tech-stack
  │    ├─ website-quality
  │    ├─ review-analyzer
  │    └─ lead-enrichment
  ├─ ai-opportunity-analyzer
  ├─ lead-scoring
  ├─ offer-generator + cold-email-generator
  ├─ report-generator
  └─ crm-export
```

Traceability: each firm row keeps discovery_source + sources_json; each email keeps email_source;
scores cite signal fields; export only canonical rows.
