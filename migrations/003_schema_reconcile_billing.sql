-- Migration: Schema reconciliation + billing & cadence columns
-- Run: psql $DATABASE_URL -f migrations/003_schema_reconcile_billing.sql
--
-- Why: migrations 001/002 were never applied to the live database. This file
-- brings the live schema up to date idempotently (safe to run even if 001/002
-- were partially applied) AND adds the new billing/cadence columns.
--
-- NOTE: plain CREATE INDEX (not CONCURRENTLY) so it is safe inside a
-- transaction (Supabase MCP migration runner) and on the small tables here.

-- =============================================================================
-- 1. jurisdictions.filing_type (unblocks poll/backfill/admin list)
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jurisdictions' AND column_name = 'filing_type'
  ) THEN
    ALTER TABLE jurisdictions ADD COLUMN filing_type varchar(100) DEFAULT 'building_permit' NOT NULL;
    UPDATE jurisdictions SET filing_type = 'business_license' WHERE name ILIKE '%license%';
  END IF;
END $$;

-- =============================================================================
-- 2. jurisdictions.poll_interval_hours (cadence)
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jurisdictions' AND column_name = 'poll_interval_hours'
  ) THEN
    ALTER TABLE jurisdictions ADD COLUMN poll_interval_hours integer DEFAULT 24 NOT NULL;
  END IF;
END $$;

-- =============================================================================
-- 3. subscribers billing columns
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscribers' AND column_name = 'stripe_customer_id'
  ) THEN
    ALTER TABLE subscribers ADD COLUMN stripe_customer_id varchar(255);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscribers' AND column_name = 'stripe_subscription_id'
  ) THEN
    ALTER TABLE subscribers ADD COLUMN stripe_subscription_id varchar(255);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscribers' AND column_name = 'billing_status'
  ) THEN
    -- Existing rows are legacy-'active'; webhook + reconciliation will correct them.
    ALTER TABLE subscribers ADD COLUMN billing_status varchar(50) DEFAULT 'active' NOT NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscribers' AND column_name = 'trial_end'
  ) THEN
    ALTER TABLE subscribers ADD COLUMN trial_end timestamp without time zone;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscribers' AND column_name = 'current_period_end'
  ) THEN
    ALTER TABLE subscribers ADD COLUMN current_period_end timestamp without time zone;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscribers' AND column_name = 'last_digest_at'
  ) THEN
    ALTER TABLE subscribers ADD COLUMN last_digest_at timestamp without time zone;
  END IF;
END $$;

-- =============================================================================
-- 4. Deduplicate before adding UNIQUE constraints (no-op if already clean)
-- =============================================================================
DELETE FROM filings a USING filings b
  WHERE a.id < b.id AND a.jurisdiction_id = b.jurisdiction_id AND a.external_id = b.external_id;

DELETE FROM alerts_sent a USING alerts_sent b
  WHERE a.id < b.id AND a.subscriber_id = b.subscriber_id AND a.filing_id = b.filing_id;

-- =============================================================================
-- 5. UNIQUE CONSTRAINTS (prevent race condition duplicates)
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_filings_jurisdiction_external'
  ) THEN
    ALTER TABLE filings ADD CONSTRAINT uq_filings_jurisdiction_external UNIQUE (jurisdiction_id, external_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_alerts_sent_subscriber_filing'
  ) THEN
    ALTER TABLE alerts_sent ADD CONSTRAINT uq_alerts_sent_subscriber_filing UNIQUE (subscriber_id, filing_id);
  END IF;
END $$;

-- =============================================================================
-- 6. CHECK CONSTRAINTS (data integrity at database level)
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_subscribers_status'
  ) THEN
    ALTER TABLE subscribers ADD CONSTRAINT chk_subscribers_status CHECK (status IN ('active', 'canceled', 'past_due'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_subscribers_billing_status'
  ) THEN
    ALTER TABLE subscribers ADD CONSTRAINT chk_subscribers_billing_status CHECK (billing_status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_filing_type'
  ) THEN
    ALTER TABLE filings ADD CONSTRAINT chk_filing_type CHECK (filing_type IN ('building_permit', 'business_license'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_webhook_status'
  ) THEN
    ALTER TABLE stripe_webhook_events ADD CONSTRAINT chk_webhook_status CHECK (status IN ('pending', 'processed', 'failed'));
  END IF;
END $$;

-- =============================================================================
-- 7. GiST + geography indexes (spatial queries currently full-table scan)
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_filings_geom ON filings USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_subscribers_service_area ON subscribers USING GIST (service_area);
CREATE INDEX IF NOT EXISTS idx_filings_geom_geography ON filings USING GIST ((geom::geography));
CREATE INDEX IF NOT EXISTS idx_subscribers_service_area_geography ON subscribers USING GIST ((service_area::geography));

-- =============================================================================
-- 8. Deduplication & query indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_alerts_sent_subscriber_filing ON alerts_sent (subscriber_id, filing_id);
CREATE INDEX IF NOT EXISTS idx_alerts_sent_digested ON alerts_sent (digested) WHERE digested = false;
CREATE INDEX IF NOT EXISTS idx_alerts_sent_filing_id ON alerts_sent (filing_id);
CREATE INDEX IF NOT EXISTS idx_filings_jurisdiction_external ON filings (jurisdiction_id, external_id);
CREATE INDEX IF NOT EXISTS idx_filings_filed_at ON filings (filed_at);
CREATE INDEX IF NOT EXISTS idx_filings_filing_type ON filings (filing_type);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers (status);
CREATE INDEX IF NOT EXISTS idx_stripe_events_status ON stripeWebhookEvents (status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts (published) WHERE published = true;
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts (slug);
CREATE INDEX IF NOT EXISTS idx_quarantined_jurisdiction ON quarantined_filings (jurisdiction_id);

-- =============================================================================
-- 9. subscribers.email NOT NULL (required for digest + alert delivery)
-- =============================================================================
UPDATE subscribers SET email = '' WHERE email IS NULL;
ALTER TABLE subscribers ALTER COLUMN email SET NOT NULL;

-- =============================================================================
-- 10. AUTO-UPDATE TRIGGERS (keep updated_at in sync)
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
-- 11. Fix future watermarks (e.g. Collin County 2026-12-29) — cap to now
-- =============================================================================
UPDATE jurisdictions SET watermark_datetime = NOW() WHERE watermark_datetime > NOW();