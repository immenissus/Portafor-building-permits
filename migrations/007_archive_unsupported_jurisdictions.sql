-- Archive unsupported feeds without deleting historical filings or related records.
UPDATE jurisdictions
SET is_active = false
WHERE name IN (
  'Boston, MA',
  'Detroit, MI',
  'Fort Worth, TX',
  'King County, WA',
  'Los Angeles, CA',
  'Miami-Dade, FL',
  'San Diego, CA',
  'San Francisco, CA'
);
