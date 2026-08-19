---
name: portafor-security
description: Use when touching authentication, authorization, secrets, webhooks, or any security-sensitive code in this repo. Enforces the server-only secret rules, admin/auth boundaries, subscriber auth, Stripe webhook verification, NEXT_PUBLIC rules, and database credential protection.
---

# Portafor Security Boundaries

These are the security invariants for this codebase. Do not weaken them.
Cross-reference `AGENTS.md` §6 (Security Rules) and the official
`security-review`/`find-bugs` skills (vendored from getsentry/skills) when
auditing.

## Server-Only Secrets (NEVER client-accessible)

The following must exist only on the server runtime and must NEVER appear in a
client bundle, `NEXT_PUBLIC_*` var, log line, error response, or commit:

| Secret | Used for |
|--------|----------|
| `ADMIN_API_KEY` | Admin API access (`lib/admin-auth.ts`) |
| `CRON_SECRET` | Authorizing Vercel cron jobs (`vercel.json` → `Bearer CRON_SECRET`) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe API + webhook signature verification |
| `CLERK_SECRET_KEY` | Server-side Clerk client, user updates |
| `RESEND_API_KEY` | Sending email |
| `DATABASE_URL` | Postgres/PostGIS connection (contains credentials) |
| `SENTRY_AUTH_TOKEN`, `SENTRY_DSN` | Sentry sourcemap upload / server SDK (DSN is a server secret; do not put in client bundles) |

Do not reintroduce a `NEXT_PUBLIC_*` copy of any of the above. If something
must reach the browser, use a dedicated public var (e.g.
`NEXT_PUBLIC_MAPBOX_TOKEN`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
`NEXT_PUBLIC_API_URL`).

## Admin Authorization

`authorizeAdmin(request)` in `lib/admin-auth.ts` is the ONLY entry point for
admin routes. It accepts, in order:
1. `X-Admin-Key` or `Authorization: Bearer` matching the server-only `ADMIN_API_KEY`
2. `Authorization: Bearer` matching `CRON_SECRET` (for Vercel crons)
3. A Clerk session whose user has `publicMetadata.role === "admin"`

Every route under `/api/admin/*`, `/api/jurisdictions`, `/api/blog/posts`
(write + `?all=1`), and the job routes (`poll`, `backfill`, `digest`) MUST call
it and return the error response immediately if it fails — before any DB work.

## Subscriber Authentication

- `GET /api/filings` requires a valid `X-Subscriber-Key` belonging to an
  **active** subscriber, or an admin. Invalid/expired keys → 401/403.
- `GET /api/subscribers/[id]` must only return data for the authenticated
  owner (match on the Clerk user id / subscriber key), never an arbitrary id.
- Subscriber `api_key` is a bearer credential — treat it like a secret in logs.

## Stripe Webhook Verification

`POST /api/billing/webhook` MUST verify `stripe.webhooks.constructEvent` with
`STRIPE_WEBHOOK_SECRET` before processing anything. Missing signature or
secret → 400. Events are deduplicated via the `stripe_webhook_events` table
(status `pending` → `processed`/`failed`) so retries are safe.

## Secrets in `.env` / Git

- Never commit `.env*`. `.env.example` contains placeholders only.
- Never print secrets in `console.error`/responses. Sanitize errors returned
  to clients (route handlers return generic `detail` messages; raw PG errors
  may contain query/connection info — strip before responding).
- Keep `tsconfig.tsbuildinfo` and other generated artifacts out of git.

## Database Credentials

- `DATABASE_URL` lives only on the server / Vercel env. Never expose it to
  clients or the Supabase/Postgres MCP unless explicitly enabled by the user
  (see `opencode.json` — `postgres` MCP is disabled by default).
- The Supabase MCP is pinned to a **development** project and read-only
  (`read_only=true`). Never point it at production.

## Sentry

- `SENTRY_DSN` is server-only; the SDK is initialized in
  `sentry.server.config.ts` / `sentry.edge.config.ts`. Do not log or forward
  secrets into Sentry tags/breadcrumbs.