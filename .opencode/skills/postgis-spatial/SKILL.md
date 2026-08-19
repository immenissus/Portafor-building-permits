---
name: postgis-spatial
description: Use when writing or reviewing PostGIS spatial queries in this repo — filings proximity search, subscriber service-area matching, geocoding, or anything involving ST_* functions, geometry, or geography indexes.
---

# PostGIS Spatial Queries

Portafor stores geometry as `geometry` columns via a custom Drizzle type in `lib/db/schema.ts` (raw WKT/GeoJSON strings passed through; SQL casts handle the PostGIS types). The columns: `filings.geom` (point), `subscribers.service_area` (polygon).

## The one rule: index-friendly geography

- Proximity search (`/api/filings`) uses: `ST_DWithin(geom::geography, point::geography, radius_meters)`.
- The expression index `idx_filings_geom_geography` (migration 002) backs it: `CREATE INDEX ... ON filings USING GIST ((geom::geography))`.
- NEVER use `ST_DistanceSphere(...) < x` as a filter — it scans everything. If you see it, replace with `ST_DWithin` on the geography cast.

## Matcher pattern (batch, not N+1)

Poll/backfill match filings to subscribers in ONE query per filing type using a `VALUES` list:

```sql
SELECT s.id AS subscriber_id, f.filing_id AS filing_id
FROM (VALUES (id1, lng1, lat1), (id2, lng2, lat2)) AS f(filing_id, longitude, latitude)
INNER JOIN subscribers s
  ON s.status = 'active'
 AND s.filing_type_filters ? <filingType>
 AND ST_Contains(s.service_area, ST_SetSRID(ST_MakePoint(f.longitude, f.latitude), 4326))
WHERE NOT EXISTS (
  SELECT 1 FROM alerts_sent a
  WHERE a.subscriber_id = s.id AND a.filing_id = f.filing_id
)
```

Key points:
- `ST_Contains(polygon, point)` — polygon first, point second (not the reverse).
- Longitude is the FIRST argument to `ST_MakePoint` (lon, lat).
- `ST_SetSRID(..., 4326)` sets the SRID on the constructed point.
- Dedup happens in the same query via `NOT EXISTS` against `alerts_sent`.
- Batch the `VALUES` list with `sql.join(...)` and `sql\`, \``; never loop per row.

## Geocoding

- Done with a concurrency limit (`lib/async.ts` `mapLimit`, 6 concurrent) — never fire unbounded parallel geocode requests.
- Candidates with no coordinates after geocoding go to `quarantined_filings`.

## Useful queries

```sql
-- Geography distance in meters
SELECT ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(-97.74, 30.26), 4326)::geography) AS meters FROM filings LIMIT 10;

-- Debug: does a point fall inside any active service area?
SELECT s.business_name FROM subscribers s
WHERE s.status = 'active'
  AND ST_Contains(s.service_area, ST_SetSRID(ST_MakePoint(-97.74, 30.26), 4326));
```