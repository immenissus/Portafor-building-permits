-- Persist source freshness and per-run poll diagnostics.
ALTER TABLE jurisdictions
  ADD COLUMN IF NOT EXISTS last_source_record_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_records_fetched INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_new_filings INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS sync_status VARCHAR(50) NOT NULL DEFAULT 'never';
