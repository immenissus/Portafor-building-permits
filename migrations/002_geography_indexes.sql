-- Migration: Index-assisted geography queries + data integrity constraints
-- Run: psql $DATABASE_URL -f migrations/002_geography_indexes.sql
-- All indexes use CONCURRENTLY to avoid locking

-- =============================================================================
-- 1. GEOGRAPHY GiST INDEXES (back ST_DWithin used by /api/filings)
-- =============================================================================
-- ST_DWithin(geom::geography, point::geography, radius) requires an index on the
-- geography expression to avoid a full table scan.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_filings_geom_geography
  ON filings USING GIST ((geom::geography));
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscribers_service_area_geography
  ON subscribers USING GIST ((service_area::geography));

-- =============================================================================
-- 2. subscribers.email NOT NULL (required for digest + alert delivery)
-- =============================================================================
UPDATE subscribers SET email = '' WHERE email IS NULL;
ALTER TABLE subscribers ALTER COLUMN email SET NOT NULL;