---
name: portafor-testing
description: Use when writing or reviewing tests for this repo — unit/business logic, E2E/user workflows, test-first development, regression tests, security/auth tests, or database/PostGIS tests. Covers the Vitest + Playwright strategy and the mandatory test-first workflow.
---

# Portafor Testing Strategy

Portafor follows a **test-first** discipline for major functionality (see the
TEST-FIRST RULE in `AGENTS.md`). This skill documents the tooling and how to
apply it to this codebase.

## Tooling

- **Vitest** — unit/business logic. Config in `vitest.config.ts`. Tests live
  next to the code as `**/*.test.ts` and run with `npm run test` (or
  `npm run test:watch`).
- **Playwright** — E2E / user workflows against the running Next.js app.
  Available as the `playwright` MCP server (see `opencode.json`) and/or the
  Playwright test runner. Current unit suite: `lib/utils.test.ts` (8 tests:
  `createCirclePolygon`, `filingLabel`, `businessTypeLabel`, `relativeTime`, `cn`).
- **TypeScript** — `npm run typecheck` (tsc --noEmit) is the type gate.

## Test-First Workflow (MANDATORY for major work)

`requirement → acceptance criteria → failing test → implementation → passing test → regression tests`

1. Define expected behavior / acceptance criteria first.
2. Write the relevant test BEFORE the production code.
3. Run it and confirm it fails for the expected reason (red).
4. Implement the functionality.
5. Run it again and confirm it passes (green).
6. Run the relevant regression suite.
7. For bug fixes: reproduce the bug with a failing regression test FIRST, then fix.

Never write a test merely to confirm already-working implementation. Never
weaken/delete/change a test to force a pass without explicit justification.
Tests verify behavior/contracts, not implementation details.

## What to Cover

- **Business logic** (Vitest): utils in `lib/` — geocode normalization, filing
  type resolution, plan-name resolution, email HTML builders, radius/geometry
  helpers, subscription/filter matching predicates. Include boundary and error
  cases (empty input, malformed dates, NaN coordinates, missing fields).
- **API/security/auth**: route handler behavior — `authorizeAdmin` matrix
  (X-Admin-Key / CRON_SECRET / Clerk admin), `X-Subscriber-Key` on
  `/api/filings`, Stripe webhook signature verification, quota/validation
  rejections. Test auth failures return 401/403 before any DB work.
- **Database/PostGIS**: SQL-level behavior for the matcher and proximity
  queries — `ST_Contains(polygon, point)` semantics, lon/lat argument order,
  geography `ST_DWithin` radius math, batch `VALUES` dedup against
  `alerts_sent`. Prefer testing against a disposable/local PostGIS instance or
  extracted pure functions; do not hit the production database.
- **E2E (Playwright)**: onboarding → dashboard flow, admin jurisdiction
  management, subscriber alert settings, Stripe test-mode checkout redirect.

## Rules

- Keep tests fast and deterministic; avoid network/DB in unit tests.
- Use `vi.mock` sparingly and only at module boundaries (e.g. Resend, Stripe,
  geocoder) — mock the edge, test the logic.
- When you change a schema or a contract (`lib/types.ts`, API payloads), the
  tests for it must be updated in the same change, via test-first where applicable.
- Do not install generic testing skills/frameworks beyond Vitest + Playwright.