-- Migration: Critical indexes, constraints, and schema fixes
-- Run: psql $DATABASE_URL -f migrations/001_critical_indexes.sql
-- All indexes use CONCURRENTLY to avoid locking

-- =============================================================================
-- 1. GiST INDEXES (CRITICAL — spatial queries currently do full table scans)
-- =============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_filings_geom ON filings USING GIST (geom);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscribers_service_area ON subscribers USING GIST (service_area);

-- =============================================================================
-- 2. DEDUPLICATION & QUERY INDEXES
-- =============================================================================
-- alerts_sent: subscriber+filing lookup (dedup check in poll/backfill)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alerts_sent_subscriber_filing ON alerts_sent (subscriber_id, filing_id);
-- alerts_sent: undigested alerts for digest job
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alerts_sent_digested ON alerts_sent (digested) WHERE digested = false;
-- filings: duplicate check in poll/backfill
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_filings_jurisdiction_external ON filings (jurisdiction_id, external_id);
-- filings: watermark and digest queries filter on filed_at
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_filings_filed_at ON filings (filed_at);
-- filings: filing_type filter in subscriber matching
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_filings_filing_type ON filings (filing_type);
-- subscribers: status filter used in every subscriber query
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscribers_status ON subscribers (status);
-- stripeWebhookEvents: self-healing queue queries status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stripe_events_status ON stripeWebhookEvents (status);
-- blog_posts: public blog queries filter on published
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_blog_posts_published ON blog_posts (published) WHERE published = true;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_blog_posts_slug ON blog_posts (slug);
-- alerts_sent: filing_id for joins
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alerts_sent_filing_id ON alerts_sent (filing_id);
-- quarantined_filings: jurisdiction lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quarantined_jurisdiction ON quarantined_filings (jurisdiction_id);

-- =============================================================================
-- 3. UNIQUE CONSTRAINTS (prevent race condition duplicates)
-- =============================================================================
ALTER TABLE filings ADD CONSTRAINT uq_filings_jurisdiction_external UNIQUE (jurisdiction_id, external_id);

-- =============================================================================
-- 4. CHECK CONSTRAINTS (data integrity at database level)
-- =============================================================================
ALTER TABLE subscribers ADD CONSTRAINT chk_subscribers_status CHECK (status IN ('active', 'canceled', 'past_due'));
ALTER TABLE filings ADD CONSTRAINT chk_filing_type CHECK (filing_type IN ('building_permit', 'business_license'));
ALTER TABLE stripe_webhook_events ADD CONSTRAINT chk_webhook_status CHECK (status IN ('pending', 'processed', 'failed'));

-- =============================================================================
-- 5. AUTO-UPDATE TRIGGERS (keep updated_at in sync)
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_subscribers_updated_at ON subscribers;
CREATE TRIGGER trg_subscribers_updated_at BEFORE UPDATE ON subscribers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_blog_posts_updated_at ON blog_posts;
CREATE TRIGGER trg_blog_posts_updated_at BEFORE UPDATE ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- 6. ADD digested COLUMN TO alerts_sent (if not exists)
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alerts_sent' AND column_name = 'digested'
  ) THEN
    ALTER TABLE alerts_sent ADD COLUMN digested boolean DEFAULT false NOT NULL;
  END IF;
END $$;

-- =============================================================================
-- 7. ADD filing_type COLUMN TO jurisdictions (replaces fragile name-based inference)
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jurisdictions' AND column_name = 'filing_type'
  ) THEN
    ALTER TABLE jurisdictions ADD COLUMN filing_type varchar(100) DEFAULT 'building_permit' NOT NULL;
    -- Backfill existing data based on name heuristic
    UPDATE jurisdictions SET filing_type = 'business_license' WHERE name ILIKE '%license%';
  END IF;
END $$;
