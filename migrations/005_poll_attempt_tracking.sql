-- Track every poll attempt separately from successful completion.
ALTER TABLE jurisdictions
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP;
