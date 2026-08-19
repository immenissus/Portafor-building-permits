---
name: database-migrations
description: Use when touching database schema, writing or applying migrations, or resolving schema drift. Covers the Drizzle schema in lib/db/schema.ts, the numbered SQL files in migrations/, and how to keep the two in sync with the live PostgreSQL/PostGIS database.
---

# Database Migrations & Schema Drift

Portafor uses Drizzle ORM (`lib/db/schema.ts`) as the TypeScript schema AND numbered SQL migration files (`migrations/*.sql`) as the source of truth for the deployed database. The two MUST stay in sync — drift between them is a recurring bug class in this repo.

## Files

- `lib/db/schema.ts` — single Drizzle schema for all tables (subscribers, jurisdictions, filings, quarantined_filings, alerts_sent, stripe_webhook_events, blog_posts).
- `migrations/001_critical_indexes.sql` — GiST indexes, unique constraints, check constraints, `jurisdictions.filing_type` column, `updated_at` triggers, `alerts_sent.digested`.
- `migrations/002_geography_indexes.sql` — geography GiST indexes for `ST_DWithin`, `subscribers.email NOT NULL` (+ backfill of NULLs to `''`).

## Rules

- Every column added in a migration must exist in `lib/db/schema.ts` with matching nullability/defaults, and vice versa. If you change one, change the other in the same commit.
- Drizzle column names are camelCase (`filingType`) mapped to snake_case DB columns (`filing_type`) via the string key. Do not rename one side without the other.
- `jsonb` columns use `.$type<...>()` to keep the TypeScript type (e.g. `$type<string[]>()`); raw SQL always sees the JSON value.
- Migrations are applied with: `psql $DATABASE_URL -f migrations/00X_*.sql` (see header comments in each file).
- Indexes use `CREATE INDEX CONCURRENTLY` and `IF NOT EXISTS`; idempotent DDL for columns/triggers goes in `DO $$ ... $$` blocks.
- After any schema change, run `npm run typecheck` and check the poll/backfill/filings routes for hardcoded column assumptions.

## Known drift history (do not regress)

- `jurisdictions.filing_type` exists in migration 001 and schema.ts. Poll/backfill resolve filing type from this column, NOT name inference (`name.toLowerCase().includes("license")`).
- `subscribers.email` is NOT NULL (migration 002) and required in `Subscriber` (lib/types.ts). Upserts must always supply an email (Clerk fallback is `""`).
- Quarantine table is `quarantined_filings` (snake_case), not `quarantinedFilings` — migration 001 fixed this after a bug.

## New migration checklist

1. Write the SQL as `migrations/NNN_short_name.sql` following the existing style (header comment, `CONCURRENTLY`, `IF NOT EXISTS`, idempotent `DO` blocks).
2. Mirror the change in `lib/db/schema.ts` (and `lib/types.ts` if a client-facing type changes).
3. Grep the codebase for any hardcoded column assumptions that the change invalidates.
4. Verify with `npm run typecheck && npm run lint`.