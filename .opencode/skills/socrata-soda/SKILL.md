---
name: socrata-soda
description: Use when working with Socrata SODA API endpoints, jurisdiction polling, backfills, or the column_field_map remapping. Covers the SODA query format, app tokens, pagination, and the poll/backfill ingestion pipeline in app/api/jobs.
---

# Socrata SODA API

Portafor ingests open municipal data from Socrata SODA endpoints (building permits / business licenses). The pipeline lives in `app/api/jobs/poll/route.ts` (incremental, cron) and `app/api/jobs/backfill/route.ts` (bulk, date range). Both are admin-only.

## Endpoint shape

`https://<domain>/resource/<resource_id>.json?<params>`

- `$where=<field> > '<ISO8601>'` — server-side filter (watermark/date range). Use `AND` inside `$where` for ranges.
- `$order=<field> ASC|DESC` — server-side sort.
- `$limit=1000` — max rows per request; poll/backfill page through batches.
- Optionally `X-App-Token` header via `appToken` when a jurisdiction needs one.

## column_field_map

Each jurisdiction row stores a `column_field_map` JSONB object that maps canonical keys to the Socrata column names, e.g.:

```json
{ "address": "permit_location", "issued_date": "issue_date", "permit_number": "permit_number", "latitude": "latitude", "longitude": "longitude" }
```

Canonical keys used by the pipeline: `address`, `issued_date`, `permit_number`, `license_number`, `latitude`, `longitude`, `id`.

The remap step (`Record<string, string>`) strings every Socrata value, then copies unmapped raw fields as fallbacks. Core fields are required: external id (`permit_number || license_number || id`), address, and issued_date (must parse to a valid `Date`). Records missing them are quarantined to `quarantined_filings`.

## Rules

- NEVER introduce per-row Socrata fetches. Always batch: one fetch per jurisdiction per window, then batch-insert.
- Do not reintroduce name-based filing-type inference; use `jurisdictions.filingType` (see the database-migrations skill).
- Watermark defaults to 24h ago when empty in poll, so the first run is a bounded window, not a full download.
- Backfill paginates by advancing the watermark past the last `filedAt` seen in a batch; a batch with 0 records ends the loop.
- Keep column mappings verified against live APIs; the seed list in `app/api/admin/seed/route.ts` is annotated with the verification date.

## Common failure modes

- `Missing core fields` — the jurisdiction's `column_field_map` doesn't match the live dataset; check the Socrata `$select=*` metadata first.
- `Invalid date` — Socrata date fields are ISO-8601; some feeds return "na" or empty strings.
- No coordinates — feed lacks lat/lng; candidate is quarantined with `No coordinates available` unless a geocoder is wired up.