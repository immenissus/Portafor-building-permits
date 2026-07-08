# Supabase Audit Report — Portafor (RoofLead)

Generated: 2026-07-07

---

## Critical Issues

### C1. No GiST Indexes on Geometry Columns
**Impact:** Every `ST_Contains`, `ST_DistanceSphere`, and spatial query does a sequential scan.
**Tables affected:** `filings.geom`, `subscribers.service_area`
**SQL Fix:**
```sql
CREATE INDEX idx_filings_geom ON filings USING GIST (geom);
CREATE INDEX idx_subscribers_service_area ON subscribers USING GIST (service_area);
```

### C2. No Index on `alerts_sent` for Deduplication Queries
**Impact:** The `NOT EXISTS (SELECT 1 FROM alerts_sent WHERE subscriber_id = X AND filing_id = Y)` check in poll/backfill does a sequential scan on every new filing for every matched subscriber.
**SQL Fix:**
```sql
CREATE INDEX idx_alerts_sent_subscriber_filing ON alerts_sent (subscriber_id, filing_id);
CREATE INDEX idx_alerts_sent_digested ON alerts_sent (digested) WHERE digested = false;
```

### C3. No Index on `filings` for Duplicate Checks
**Impact:** The `WHERE jurisdiction_id = X AND external_id = Y` check in poll/backfill scans the entire filings table.
**SQL Fix:**
```sql
CREATE INDEX idx_filings_jurisdiction_external ON filings (jurisdiction_id, external_id);
```

### C4. No Index on `filings.filed_at`
**Impact:** The digest query `WHERE filed_at >= X` and watermark queries scan full table.
**SQL Fix:**
```sql
CREATE INDEX idx_filings_filed_at ON filings (filed_at);
```

### C5. `NEXT_PUBLIC_ADMIN_API_KEY` Exposed to Client
**Impact:** This key is prefixed `NEXT_PUBLIC_` which means it's bundled into client-side JavaScript. Anyone can view source and find it. This key gates jurisdiction creation, backfill, and blog post management.
**Severity:** CRITICAL security issue.
**Fix:** Rename to `ADMIN_API_KEY` (remove `NEXT_PUBLIC_` prefix). Update all `process.env.NEXT_PUBLIC_ADMIN_API_KEY` references to use a server-only check.

### C6. Unauthenticated API Routes
**Impact:** Several routes have no auth check:
- `GET /api/jurisdictions` — exposes all jurisdiction config including Socrata app tokens
- `GET /api/filings` — exposes all filings data
- `GET /api/jobs/poll` — triggers the entire poll job (任何人 can trigger data ingestion)
- `GET /api/jobs/digest` — triggers digest emails (任何人 can trigger mass emails)
- `GET /api/jobs/backfill` (POST) — has admin key check, OK
**Fix:** Add auth or API key checks to these routes.

---

## High Priority

### H1. N+1 Pattern in Poll and Backfill Routes
**Impact:** For every new filing, the code runs a separate `ST_Contains` query against all subscribers, then loops through matches and inserts one `alerts_sent` row at a time.
**Location:** `poll/route.ts:187-206`, `backfill/route.ts:157-176`
**Fix:** Batch the subscriber match query and batch-insert `alerts_sent` records.

### H2. `ST_DistanceSphere` in Filings Search is Slow
**Impact:** `ST_DistanceSphere` cannot use a GiST index. Every proximity query computes distance to ALL filings.
**Location:** `filings/route.ts:45-47`
**Fix:** Use `ST_DWithin` with geography cast for index-assisted proximity:
```sql
WHERE geom::geography <@> ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography <= radius_meters
```
Or add a bounding box pre-filter:
```sql
WHERE geom && ST_MakeEnvelope(west, south, east, north, 4326)
  AND ST_DistanceSphere(geom, point) <= radius
```

### H3. Missing Foreign Key Indexes
**Impact:** No index on `filing_id` in `alerts_sent`, no index on `jurisdiction_id` in `quarantined_filings`.
**SQL Fix:**
```sql
CREATE INDEX idx_alerts_sent_filing_id ON alerts_sent (filing_id);
CREATE INDEX idx_quarantined_filings_jurisdiction ON quarantined_filings (jurisdiction_id);
```

### H4. `stripeWebhookEvents.payload` Stores Full Event
**Impact:** The entire Stripe event object (potentially large) is stored as JSONB. This table will grow unbounded.
**Fix:** Add a cleanup job or TTL. Consider storing only `event.id`, `event.type`, `clerkUserId`, `status`.

### H5. No Unique Constraint on `filings (jurisdiction_id, external_id)`
**Impact:** Duplicate checking is done via application-level `SELECT` before `INSERT`, which has a race condition under concurrent poll runs.
**SQL Fix:**
```sql
ALTER TABLE filings ADD CONSTRAINT uq_filings_jurisdiction_external UNIQUE (jurisdiction_id, external_id);
```

---

## Medium Priority

### M1. `subscribers.email` is Nullable
**Impact:** Digest emails silently skip subscribers with null email. Should be NOT NULL since it's required for the product.
**SQL Fix:**
```sql
-- First update any nulls
UPDATE subscribers SET email = '' WHERE email IS NULL;
ALTER TABLE subscribers ALTER COLUMN email SET NOT NULL;
```

### M2. `subscribers.market` is Nullable and Unused
**Impact:** The `market` column exists but isn't used in queries. Consider removing or making it NOT NULL.

### M3. No Index on `subscribers.status`
**Impact:** Every subscriber query filters on `status = 'active'`. Should have an index.
**SQL Fix:**
```sql
CREATE INDEX idx_subscribers_status ON subscribers (status);
```

### M4. No Index on `stripeWebhookEvents.status`
**Impact:** The self-healing retry queue queries `WHERE status = 'failed'` on every poll run.
**SQL Fix:**
```sql
CREATE INDEX idx_stripe_events_status ON stripeWebhookEvents (status);
```

### M5. `blog_posts` Has No Index on `published`
**Impact:** The public blog query filters `WHERE published = true`.
**SQL Fix:**
```sql
CREATE INDEX idx_blog_posts_published ON blog_posts (published) WHERE published = true;
CREATE INDEX idx_blog_posts_slug ON blog_posts (slug);
```

### M6. No Check Constraints
**Impact:** No validation at database level for:
- `subscribers.status` should be one of: 'active', 'canceled', 'past_due'
- `stripeWebhookEvents.status` should be one of: 'pending', 'processed', 'failed'
- `filing_type` should be one of: 'building_permit', 'business_license'
**SQL Fix:**
```sql
ALTER TABLE subscribers ADD CONSTRAINT chk_subscribers_status CHECK (status IN ('active', 'canceled', 'past_due'));
ALTER TABLE stripeWebhookEvents ADD CONSTRAINT chk_webhook_status CHECK (status IN ('pending', 'processed', 'failed'));
ALTER TABLE filings ADD CONSTRAINT chk_filing_type CHECK (filing_type IN ('building_permit', 'business_license'));
```

### M7. `jurisdictions.appToken` Stored in Plain Text
**Impact:** Socrata app tokens are sensitivity level low but should still be encrypted at rest if possible.

---

## Low Priority

### L1. Inconsistent Naming
- Drizzle uses `camelCase` (e.g., `businessName`), PostgreSQL uses `snake_case` (e.g., `business_name`). This is normal for Drizzle but worth noting.
- `filingTypeFilters` vs `filing_type_filters` — consistent with Drizzle convention.

### L2. No `updated_at` Auto-Update Trigger
**Impact:** `subscribers.updated_at` and `blog_posts.updated_at` are only updated by application code. A trigger would be safer.
**SQL Fix:**
```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_subscribers_updated_at BEFORE UPDATE ON subscribers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_blog_posts_updated_at BEFORE UPDATE ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### L3. `quarantinedFilings` Has No Cleanup
**Impact:** Failed records accumulate forever.

### L4. No `ON DELETE CASCADE` on Foreign Keys
**Impact:** If a jurisdiction is deleted, `filings` and `quarantinedFilings` rows become orphaned. Current FKs use default `NO ACTION`.

---

## Security Findings

### S1. CRITICAL: `NEXT_PUBLIC_ADMIN_API_KEY` in Client Bundle
See C5 above. This is the most urgent fix.

### S2. Poll/Digest Routes Are Unauthenticated
See C6 above. An attacker could:
- Trigger unlimited poll runs (resource exhaustion)
- Trigger unlimited digest emails (spam)
- Trigger backfill jobs (if they guess the admin key from client bundle)

### S3. Jurisdictions Endpoint Leaks App Tokens
`GET /api/jurisdictions` returns `appToken` field (though the POST endpoint redacts it).

### S4. No Rate Limiting on Any API Route
All routes are vulnerable to abuse.

### S5. SQL Injection Risk in Filings Search
`filings/route.ts:48`: The `type` parameter is interpolated via `sql` template but is user-controlled. Drizzle's `sql` template does parameterize this, so it's safe. However, the `.trim().toLowerCase()` is the only sanitization.

---

## Performance Opportunities

### P1. GiST Indexes (Critical — see C1)
Estimated impact: 10-100x faster spatial queries.

### P2. Composite Index for Deduplication (see C2, C3)
Estimated impact: 5-20x faster poll/backfill jobs.

### P3. Batch Inserts in Poll Route
Currently inserts one `alerts_sent` row per matched subscriber per filing. Batching would reduce round trips.
Estimated impact: 2-5x faster poll job.

### P4. Connection Pool Tuning
Ensure Supabase connection pool is sized correctly for the concurrent poll/digest/backfill jobs.

---

## Migration Plan (Safe Execution Order)

| Order | Fix | Risk | Downtime | Rollback |
|-------|-----|------|----------|----------|
| 1 | Add GiST indexes (C1) | Low | None (CONCURRENTLY) | DROP INDEX |
| 2 | Add dedup indexes (C2, C3, C4) | Low | None | DROP INDEX |
| 3 | Add FK indexes (H3) | Low | None | DROP INDEX |
| 4 | Add unique constraint (H5) | Medium | None if no dupes | DROP CONSTRAINT |
| 5 | Add status indexes (M3, M4) | Low | None | DROP INDEX |
| 6 | Add blog indexes (M5) | Low | None | DROP INDEX |
| 7 | Add check constraints (M6) | Low | None if data valid | DROP CONSTRAINT |
| 8 | Add updated_at triggers (L2) | Low | None | DROP TRIGGER |
| 9 | Rename NEXT_PUBLIC_ADMIN_API_KEY (C5) | Medium | Deploy required | Revert env var |
| 10 | Add auth to open routes (C6) | Medium | Deploy required | Revert code |

**All index additions should use `CONCURRENTLY` to avoid locking.**
