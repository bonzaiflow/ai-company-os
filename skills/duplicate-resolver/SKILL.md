# Duplicate Resolver

Merge the same company appearing across Google/OSM/Yellow Pages/Facebook/Register
into one canonical firm.

## Match keys (strong → weak)
1. Registration number (HRB/FN/CHE) exact
2. Website canonical_domain exact
3. Phone digits exact (normalize: strip spaces/-/())
4. Name similarity + same city + (~same coords if both have lat/lon)
5. Name similarity + same street

## Process
1. Load candidates from all discovery_source rows.
2. Normalize: lower(name), strip GmbH/AG/e.U. for comparison, domain without www.
3. Build clusters; pick canonical row = richest (most non-null of website, email, phone,
   register_no) then oldest id.
4. Merge fields: prefer non-null; on conflict prefer register > website impressum >
   maps > directory. Keep `sources_json` list of all source ids/urls.
5. Soft-delete or point duplicates: `canonical_id=<id>`, `is_duplicate=1`.

## SQL sketch
Partition by domain or by `lower(name)||'|'||city`; keep best row; set others’
canonical_id. Report before/after counts.

## Rules
When unsure, do NOT merge — link as `possible_duplicate_of` instead.
Never drop unique emails/phones; move extras into contacts table.
