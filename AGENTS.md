# AGENTS.md — Portafor (RoofLead)

Operating instructions for AI coding agents working in this repository.

## 1. Project Overview

RoofLead (Portafor) is a production SaaS that generates homeowner leads for local
roofing/contracting businesses by monitoring municipal open-data feeds (Socrata SODA).
It polls building permits / business licenses, geocodes addresses, runs PostGIS
spatial intersections against contractor service territories, and emails matched
contractors.

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind, Mapbox GL — deployed on Vercel.
- **Database:** PostgreSQL + PostGIS (Supabase/Railway), accessed via Drizzle ORM (`drizzle-orm/postgres-js`).
- **Auth:** Clerk (sessions, `publicMetadata` billing sync).
- **Billing:** Stripe (30-day trial, webhooks update Clerk metadata).
- **Email:** Resend.
- **Jobs:** Vercel Cron (`/api/jobs/poll` at 00:00, `/api/jobs/digest` at 06:00) — see `vercel.json`.

## 2. Commands

```bash
npm run dev        # Next.js dev server
npm run build      # Production build
npm run lint       # eslint .  (NOT `next lint` — removed in Next 16)
npm run typecheck  # tsc --noEmit
npm run test       # vitest run (unit tests in **/*.test.ts)
```

**Before proposing changes you MUST run `npm run typecheck` and `npm run lint`.**
Never suppress or bypass TypeScript errors.

## 3. Workflow Protocol (Mandatory)

Follow a strict Plan-Then-Execute cycle:

1. **Plan** — output an `IMPLEMENTATION PLAN` markdown block before writing/modifying
   code. List exact file paths, logic, and API payloads step-by-step. **Stop and wait
   for user confirmation before writing code.**
2. **Execute** — write modular, self-documenting, strongly-typed TypeScript. No
   placeholders, no `// TODO`, no partial snippets.
3. **Verify** — run `npm run typecheck` and `npm run lint`; run `npm run test` for
   any touched logic.

## 4. TEST-FIRST RULE (MANDATORY)

For every major new function, endpoint, service, database operation,
security-sensitive behavior, data pipeline, or significant feature:

- Define expected behavior/acceptance criteria first.
- Write the relevant test BEFORE implementing the production functionality.
- Run the test and confirm it fails for the expected reason.
- Then implement the functionality.
- Run the test again and confirm it passes.
- Run the relevant regression suite.
- For bug fixes, reproduce the bug with a failing regression test BEFORE fixing it.
- Never write a test after implementation merely to confirm that implementation.
- Never weaken/delete/change a test just to make the implementation pass without explicit justification.
- Tests must verify behavior/contracts, not simply mirror implementation details.
- Include important error, boundary, authorization/security, and regression cases where applicable.
- If true test-first development is impractical, explicitly explain why.

Required workflow:

`requirement → acceptance criteria → failing test → implementation → passing test → regression tests`

A major feature is NOT complete without appropriate tests.

## 5. Code Style & Conventions

- Functional components with arrow syntax. React Server Components by default; mark
  interactive components `"use client"`.
- Server-side data fetching where possible; keep utilities modular and separate from UI.
- Semantic HTML + Tailwind utility classes. Do not write custom CSS files.
- Refs in custom inputs/selects/textareas (`components/ui/field.tsx`) MUST use
  `React.forwardRef` — dropping refs breaks React Hook Form tracking.
- Centralize all API calls in `lib/api.ts` and use React Query hooks. No duplicate logic.

## 6. Security Rules (CRITICAL)

- **Admin key is server-only.** `ADMIN_API_KEY` must never be referenced from a
  client bundle. Do not reintroduce a `NEXT_PUBLIC_*` admin key.
- Admin routes authenticate via `authorizeAdmin(request)` (`lib/admin-auth.ts`):
  (1) `X-Admin-Key`/`Authorization: Bearer` with the server-only `ADMIN_API_KEY`, or
  (2) `CRON_SECRET` bearer for Vercel crons, or (3) a Clerk user with
  `publicMetadata.role === "admin"`.
- `STRIPE_SECRET_KEY`, `CLERK_SECRET_KEY`, `RESEND_API_KEY`, `ADMIN_API_KEY`,
  `CRON_SECRET`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN` are server-side only —
  never print or send them to the client.
- Never commit `.env*` files. `.env.example` must contain placeholders only.
- `GET /api/filings` requires a valid `X-Subscriber-Key` (active subscriber) or admin.
- `GET /api/jurisdictions` is admin-only.

## 7. Database & Performance Conventions

- `lib/db/index.ts` is the single Drizzle connection; migrations live in `migrations/`.
- **Apply migrations** (`001_critical_indexes.sql`, `002_geography_indexes.sql`) to the
  database — the poll/backfill and filings queries depend on the GiST indexes, unique
  constraint on `filings (jurisdiction_id, external_id)`, and `subscribers.email NOT NULL`.
- Spatial queries must be index-friendly: use `ST_DWithin(geom::geography, point::geography, radius)`,
  never `ST_DistanceSphere` as a filter (it scans everything). The geography index
  (`idx_filings_geom_geography`) backs it.
- **Batch, don't loop:** poll/backfill must dedupe in batched `IN` queries, geocode
  with a concurrency limit (`lib/async.ts` `mapLimit`), batch-insert filings, and run
  ONE `ST_Contains` matcher query per filing type over a `VALUES` list. Do not reintroduce
  per-row `SELECT`/`INSERT`/geocode patterns (N+1).
- `jurisdictions.filing_type` column (added in migration 001) is preferred over the
  fragile name-based inference (`name.toLowerCase().includes("license")`).

## 8. Potentially Dead Code & Unused Data (DO NOT REMOVE WITHOUT CONFIRMATION)

The following are **potentially dead** — flagged by the codebase audit, not yet
verified as safe to remove. Treat them as candidates, not cleanup tasks. Confirm with
the user before deleting:

| Item | Location | Status |
|------|----------|--------|
| `billing/portal` route handler | `app/api/billing/portal/route.ts` | Never called from the frontend; settings links to `/pricing` instead |
| `filings.addressParsed` column | `lib/db/schema.ts` + `app/api/filings/route.ts` | Never populated by any code |
| `subscribers.radiusKm` column | `lib/db/schema.ts` | Radius only used client-side during onboarding |
| `subscribers.market` column | `lib/db/schema.ts` | Set during onboarding but never used in queries/filters |
| `lib/schemas.ts` | `lib/schemas.ts` | Only used by onboarding, not by API routes |
| Duplicated admin-key checks (pre-refactor) | — | Refactored into `lib/admin-auth.ts`; verify no leftovers |
| Duplicated Resend email-send logic | `app/api/alerts/test/route.ts`, `app/api/jobs/digest/route.ts` | Could be extracted to a shared `sendEmail()` util |
| `resolvePlanName` duplicated in 3 places | `app/api/billing/webhook/route.ts`, `app/api/billing/status/route.ts` | Could be a shared util |

## 9. Known Environment Requirements

- Set `CRON_SECRET` in Vercel. Vercel automatically sends `Authorization: Bearer $CRON_SECRET` for configured cron requests; do not add an `auth` property to `vercel.json` because the current Vercel schema rejects it.
- `NEXT_PUBLIC_MAPBOX_TOKEN`, `NEXT_PUBLIC_API_URL`, `DATABASE_URL` must be configured.
- Sentry: set `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` (and `SENTRY_AUTH_TOKEN`
  for sourcemap uploads). `automaticVercelMonitors` (next.config.mjs) covers the
  cron jobs; no per-handler Sentry code is required.
- The readme's original Python FastAPI backend is not present in this repo — all backend
  logic now lives in `app/api/*` route handlers.

## 10. Graphify Context-Graph Policy (benchmark-backed)

Graphify (`@mohammednagy/graphify-ts`) builds a semantic knowledge graph of the
codebase and lets the agent query it via MCP tools. A/B benchmark
(2026-08-20, 5 tasks × baseline/graphify, `opencode/deepseek-v4-flash-free`)
showed it reduces agent-session tokens on exploration-heavy work but hurts
small localized edits:

| Complexity | Token change | Notes |
|------------|--------------|-------|
| MEDIUM (pipeline/auth/PostGIS/billing audits) | **−48%** (1.92×) | Wins: t1 −59.8%, t4 −11.2%, t7 −63.8% |
| LOW (single bug fix) | **+51%** (0.66×) | t8 regressed (1.24× tokens) |

**Policy: enable Graphify for MEDIUM/HIGH-complexity tasks; skip it for LOW/simple
single-file tasks.** PASS rate and hallucination rate were identical in both arms.

- Install (global): `npm install -g @mohammednagy/graphify-ts@0.23.1`
- Per project (fresh worktree): `graphify-ts generate .` then
  `graphify-ts opencode install`. **Prerequisite:** the tracked `opencode.json` is
  JSONC; strip comments first or install fails —
  `python bench/scripts/strip_jsonc.py --in opencode.json --out opencode.json`.
- Uninstall: `graphify-ts opencode uninstall` (removes plugin, MCP entry, AGENTS.md section).
- **Cost accounting:** embedding/indexing credits are excluded from agent-session
  token/cost stats by design (`bench/scripts/parse_stats.py`). Session tokens/cost
  come only from `step_finish` events.
- Re-run the benchmark: `powershell -ExecutionPolicy Bypass -File bench/run.ps1 -Tasks t1,t4,t6,t7,t8 -Repeats 1`
