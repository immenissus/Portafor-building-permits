# Portafor — Full Codebase Review

Generated: 2026-07-07

---

## 1. Project Structure

```
app/
  api/
    admin/permits/route.ts      — Admin permits query
    admin/seed/route.ts         — Jurisdiction seeding
    alerts/test/route.ts        — Test email (now sends real permits)
    billing/checkout/route.ts   — Stripe checkout session
    billing/portal/route.ts     — Stripe billing portal
    billing/status/route.ts     — Billing status (Clerk + Stripe fallback)
    billing/webhook/route.ts    — Stripe webhook handler
    blog/posts/route.ts         — Blog CRUD API
    filings/route.ts            — Public filings proximity search
    jurisdictions/route.ts      — Jurisdiction CRUD
    jurisdictions/[id]/health/  — Jurisdiction health check
    jobs/backfill/route.ts      — Historical data backfill
    jobs/digest/route.ts        — Daily digest email
    jobs/poll/route.ts          — Socrata polling job
    subscribers/route.ts        — Subscriber upsert
    subscribers/[id]/route.ts   — Subscriber detail
  admin/                        — Admin pages (jurisdictions, permits, debug, blog)
  blog/                         — Public blog pages
  dashboard/                    — Dashboard (alerts, territory, filings, settings)
  marketing/                    — Landing page
  onboarding/                   — New user onboarding
  pricing/                      — Pricing page
  sign-in/, sign-up/            — Clerk auth pages
components/
  dashboard-client.tsx          — Client wrapper for dashboard
  dashboard-shell.tsx           — Sidebar + nav layout
  providers.tsx                 — Clerk + React Query providers
  subscription-gate.tsx         — Plan check gate
  map/                          — Mapbox map components
  ui/                           — Shared UI components
lib/
  api.ts                        — API fetch helpers
  db/index.ts                   — Drizzle + postgres connection
  db/schema.ts                  — Database schema
  schemas.ts                    — Zod validation schemas
  types.ts                      — TypeScript types
  use-subscriber.ts             — Subscriber hooks
  utils.ts                      — Utility functions
```

**Assessment:** Clean, logical structure. No orphaned directories. One minor issue: `lib/schemas.ts` is only used by onboarding — could be moved to `app/onboarding/` but not critical.

---

## 2. Duplicated Business Logic

### D1. Jurisdiction Health Endpoint Duplicates Debug Page Logic
`app/api/jurisdictions/[id]/health/route.ts` duplicates the same query the debug page does. Not a bug, but the debug page fetches from the admin permits API instead of using the health endpoint.

### D2. Filing Type Detection is Fragile
`poll/route.ts:126`:
```ts
const filingType = jur.name.toLowerCase().includes("license") ? "business_license" : "building_permit";
```
This infers filing type from the jurisdiction name. If a jurisdiction is named "Building Department" but issues business licenses, this breaks. Should be a field on the `jurisdictions` table.

### D3. Plan Name Resolution Duplicated in 3 Places
The logic to map Stripe price IDs to plan names exists in:
1. `webhook/route.ts` — `resolvePlanName()`
2. `status/route.ts` — inline
3. `webhook/route.ts` — `invoice.paid` case

The `resolvePlanName` helper is defined but only used in `customer.subscription.created/updated`. The other cases duplicate the logic inline.

**Fix:** Extract `resolvePlanName` to a shared utility and use it everywhere.

### D4. Admin Key Check Duplicated in Every Admin Route
Every admin route repeats:
```ts
const adminKeyHeader = request.headers.get("X-Admin-Key");
const expectedKey = process.env.NEXT_PUBLIC_ADMIN_API_KEY || process.env.ADMIN_API_KEY;
if (!adminKeyHeader || adminKeyHeader !== expectedKey) { ... }
```
Should be a shared middleware/helper.

### D5. Email Sending Duplicated in 3 Routes
Resend email sending is copy-pasted in:
1. `alerts/test/route.ts`
2. `jobs/digest/route.ts`
3. `jobs/poll/route.ts` (removed but was there)

Should be a shared `sendEmail()` utility.

---

## 3. Stripe Lifecycle Issues

### S1. Checkout Creates Trial Subscriptions
`checkout/route.ts:59`: `trial_period_days: 30`
This means every new subscriber starts in `trialing` status. The webhook and billing API now handle this (fixed), but the subscription gate should explicitly document that `trialing` = allowed.

### S2. No `customer.subscription.created` Handler (Fixed)
Was missing. Now handled in the webhook.

### S3. No Webhook for `checkout.session.expired`
If a user starts checkout but never completes, no cleanup happens. Low priority since Stripe handles this.

### S4. `invoice.paid` Doesn't Handle Trial→Active Transition
When a trial converts to active billing, `invoice.paid` fires. The current handler sets `status: "active"` which is correct, but it doesn't check if the subscription was previously trialing. Low priority.

### S5. Billing Portal Link in Settings Goes to Stripe
`billing/portal/route.ts` creates a Stripe billing portal session. The settings page links to `/pricing` instead of using this. Dead code — the portal endpoint exists but is never called from the frontend.

---

## 4. Clerk Synchronization

### C1. Metadata Set by Webhook Only
Clerk `publicMetadata` is ONLY updated by Stripe webhooks. If the webhook fails, the metadata stays stale. The billing status API fallback queries Stripe directly, which is correct.

### C2. `unsafeMetadata` Used for Subscriber Mapping
`onboarding/page.tsx:123-128`: After onboarding, the app writes `subscriberId` and `apiKey` to `user.unsafeMetadata`. This is used by `use-subscriber.ts` to look up the subscriber. If a user clears their Clerk session or re-signs in, this metadata persists (it's in Clerk, not localStorage). This is fragile — if the subscriber record is deleted but Clerk metadata remains, the app breaks.

### C3. No Webhook for Clerk User Deletion
If a user is deleted from Clerk, their subscriber record and Stripe customer remain orphaned.

### C4. `useUser()` Returns Stale JWT
The client-side `useUser()` hook returns the JWT from the session cookie, which doesn't refresh until `session.reload()` is called. The subscription gate handles this by checking the billing API, but other components (like settings page) still read from `user.publicMetadata` which may be stale.

---

## 5. Middleware

### M1. Middleware Blocks API Routes
`middleware.ts:10`: The matcher includes `"/(api|trpc)(.*)"` which means the Clerk middleware runs on ALL API routes. For routes that call `auth()` internally (like `/api/billing/status`), this is fine. But it adds latency to every API call.

### M2. No Rate Limiting
The middleware only checks auth. No rate limiting on any route.

### M3. `/pricing` Not Protected
The pricing page is accessible without auth, which is correct for marketing. But after login, the home page redirects to `/dashboard` which IS protected. This is fine.

---

## 6. Schema Issues

### SC1. Missing GiST Indexes (Critical)
See Supabase Audit. No spatial indexes on `filings.geom` or `subscribers.service_area`.

### SC2. Missing Unique Constraint
`filings (jurisdiction_id, external_id)` has no UNIQUE constraint. Race condition possible.

### SC3. `subscribers.email` is Nullable
Should be NOT NULL since it's required for emails.

### SC4. `addressParsed` Column Unused
`filings.addressParsed` is defined in schema but never populated by any code. Dead column.

### SC5. `radiusKm` Column Unused
`subscribers.radiusKm` is defined but never used in queries. The circle radius is only used client-side during onboarding.

### SC6. `market` Column Underused
`subscribers.market` is set during onboarding but never used in queries or filtering. The digest and poll routes don't filter by market.

### SC7. No `digested` Column in DB Yet
The schema defines `alertsSent.digested` but the database may not have this column yet. Needs migration.

---

## 7. React Architecture

### R1. Admin Layout Uses SubscriptionGate
`app/admin/layout.tsx` wraps admin pages in `SubscriptionGate`. This means admins without a paid plan can't access admin pages. This is likely wrong — admins should always have access.

### R2. `useSubscriber()` Redirects to Onboarding
`lib/use-subscriber.ts:42-44`: If the subscriber record is missing, it redirects to onboarding. This is correct for new users but could cause redirect loops if the API is down.

### R3. No Error Boundaries
No React error boundaries anywhere. If a component throws, the entire page white-screens.

### R4. QueryClient Has `refetchOnWindowFocus: false`
`providers.tsx:11`: This means data never auto-refreshes when the user switches tabs. Could lead to stale data in the dashboard.

---

## 8. API Boundaries

### A1. No Input Validation on Most Routes
Most API routes accept JSON bodies without Zod validation. Only `subscriberSchema` exists in `schemas.ts` but is only used by the onboarding form. The backend trusts whatever the client sends.

### A2. `NEXT_PUBLIC_` Admin Key Exposed to Client
Multiple components read `process.env.NEXT_PUBLIC_ADMIN_API_KEY` in the browser. This key is bundled into client JavaScript. **Critical security issue.**

### A3. Filings Search Has No Auth
`GET /api/filings` is completely unauthenticated. Anyone can search all permits.

### A4. Jurisdictions List Has No Auth
`GET /api/jurisdictions` returns all jurisdiction config including Socrata app tokens.

---

## 9. Documentation Quality

### D1. No README
No project README explaining setup, environment variables, or architecture.

### D2. No API Documentation
No OpenAPI/Swagger spec for the API routes.

### D3. No inline comments on complex logic
The PostGIS queries, Socrata field remapping, and webhook handling have minimal comments.

---

## 10. Unused Files / Dead Code

| File | Status |
|------|--------|
| `app/api/billing/portal/route.ts` | Never called from frontend |
| `lib/schemas.ts` | Only used by onboarding, not by API routes |
| `filings.addressParsed` column | Never populated |
| `subscribers.radiusKm` column | Never used in queries |
| `subscribers.market` column | Set but never queried |
| `components/dashboard-client.tsx` | Thin wrapper, could be inlined into layout |
| `postcss.config.mjs` | Standard, but check if used |
| `app/api/admin/permits/route.ts` | Only used by debug page, duplicates health endpoint |

---

## 11. Inconsistent Patterns

### I1. Mixed Auth Approaches
- Some routes use `auth()` from Clerk (billing, subscribers)
- Some routes use `X-Admin-Key` header (admin, backfill, blog)
- Some routes have no auth at all (filings, jurisdictions, poll, digest)

### I2. Mixed Error Response Formats
Some routes return `{ detail: "..." }`, others return `{ error: "..." }`. Should be consistent.

### I3. Mixed HTTP Methods for Similar Operations
- `GET /api/jurisdictions` lists all (no auth)
- `POST /api/jurisdictions` creates one (admin key)
- `GET /api/admin/permits` lists permits (admin key)
- `GET /api/filings` searches filings (no auth)

### I4. Date Handling Inconsistency
Some places use `new Date().toISOString()`, others use `new Date().toLocaleDateString()`. The Socrata watermark uses ISO format, the digest uses locale format.

---

## 12. Performance Issues

### P1. Sequential Geocoding in Poll/Backfill
`poll/route.ts:148-162`: For every filing without coordinates, a Mapbox geocoding API call is made sequentially. With 100 filings, this could take minutes.

**Fix:** Batch geocoding or parallelize with `Promise.all` (with concurrency limit).

### P2. N+1 Subscriber Matching
For every new filing, a separate `ST_Contains` query runs against all subscribers. With 100 new filings and 50 subscribers, that's 5,000 geometry comparisons.

**Fix:** Batch-match: find all filings in one query, then match against subscribers once.

### P3. No Connection Pooling Configuration
`lib/db/index.ts:8`: `postgres(connectionString, { prepare: false })` — no pool size configuration. Default pool size may be too small for concurrent poll/digest/backfill jobs.

### P4. `ST_DistanceSphere` Cannot Use Index
`filings/route.ts:45`: Every proximity query computes distance to ALL filings.

---

## 13. Security Findings

### SE1. CRITICAL: Admin Key in Client Bundle
`NEXT_PUBLIC_ADMIN_API_KEY` is readable from client JavaScript. Anyone can:
- Create jurisdictions
- Run backfill jobs
- Create/edit/delete blog posts
- Access permit data

### SE2. No CSRF Protection
API routes don't verify CSRF tokens. Since they use `Authorization` headers or cookies, this is lower risk but still a concern for cookie-based auth.

### SE3. Socrata App Tokens Exposed
`GET /api/jurisdictions` returns `appToken` field. These tokens are low-sensitivity but should still be protected.

### SE4. No Input Sanitization
Blog post content is stored as HTML and rendered via `dangerouslySetInnerHTML`. XSS risk if admin key is compromised.

### SE5. Stripe Webhook Secret in Environment
The webhook secret is in `.env` which is committed to git. This is a secret that should NOT be in version control.

---

## 14. Technical Debt Summary

| Priority | Issue | Impact |
|----------|-------|--------|
| CRITICAL | Admin key exposed to client | Security breach |
| CRITICAL | No GiST indexes | 10-100x slower queries |
| HIGH | N+1 patterns in poll/backfill | Slow jobs, high DB load |
| HIGH | No input validation on API routes | Data integrity |
| HIGH | Onboarding lists 13 cities but only 2-3 have data | User confusion |
| HIGH | Filing type inferred from jurisdiction name | Fragile logic |
| MEDIUM | Duplicated admin key checks | Maintenance burden |
| MEDIUM | Duplicated email sending code | Maintenance burden |
| MEDIUM | No error boundaries | White screen on errors |
| MEDIUM | `billing/portal/route.ts` never called | Dead code |
| MEDIUM | `addressParsed` and `radiusKm` columns unused | Schema bloat |
| LOW | No README or API docs | Onboarding difficulty |
| LOW | Inconsistent error formats | API inconsistency |
| LOW | `refetchOnWindowFocus: false` | Stale data |

---

## 15. Recommended Migration Order

1. **Rename `NEXT_PUBLIC_ADMIN_API_KEY` → `ADMIN_API_KEY`** (security)
2. **Add GiST indexes** (performance)
3. **Add unique constraint on filings** (data integrity)
4. **Add missing indexes** (performance)
5. **Extract shared utilities** (admin key check, email sending, plan name resolution)
6. **Add input validation to API routes** (data integrity)
7. **Fix admin layout to not use SubscriptionGate** (correctness)
8. **Add filing_type column to jurisdictions** (correctness)
9. **Remove unused columns** (cleanup)
10. **Add error boundaries** (UX)
