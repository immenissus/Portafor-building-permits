-- Phase G: RLS hardening. The application only touches these tables via the
-- server-side Drizzle connection (owner role, which bypasses RLS), so enabling
-- RLS with no policies denies the anon/authenticated PostgREST roles entirely.
-- stripe_webhook_events holds raw Stripe payloads (PII); blog_posts previously
-- had RLS disabled (see docs/SUPABASE_AUDIT.md).
--
-- NOTE: spatial_ref_sys is deliberately left unhardened. It is owned by the
-- PostGIS extension (not the postgres role) and is queried by PostGIS
-- functions for SRID lookups; enabling RLS there risks breaking spatial
-- operations and would require transferring extension ownership.

ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;