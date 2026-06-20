# RoofLead (Portafor) — Ultimate Developer & AI Agent Manual

RoofLead (Portafor) is a production-ready, high-performance SaaS platform designed to generate high-intent homeowner leads for local roofing and contracting businesses. It monitors real-time municipal open data feeds (such as building permits and business licenses) and instantly alerts subscribed contractors when new filings land inside their defined geographic service territories.

---

## 1. Project Purpose & Core Concept

Local contractors (roofers, HVAC, solar installers) rely on fresh public record filings to identify potential customers. RoofLead automates this by:
1. Allowing contractors to register and define their service territories.
2. Polling government open data repositories (Socrata SODA feeds).
3. Geocoding addresses, parsing coordinates, and performing spatial database intersections.
4. Notifying subscribed contractors whose territories overlap with the filings.

* **Frontend:** Next.js (TypeScript, Tailwind, Mapbox GL) deployed on **Vercel**.
* **Backend:** Python FastAPI (`FilingPulse`) deployed on **Railway** (to support heavy background threads and spatial databases).
* **Database:** PostgreSQL with the **PostGIS** extension (housed on Supabase/Railway) serving as the ultimate source of truth.
* **Authentication:** **Clerk** (stores user sessions and billing metadata).
* **Billing:** **Stripe** (subscription management with 30-day free trials).

---

## 2. Platform Architecture

```
         +-------------------------------------------------------+
         |                    Frontend Dashboard                 |
         |                     Next.js (Vercel)                  |
         +-------------------------------------------------------+
             ↙                                                ↘
  Clerk Session Auth                                    Mapbox Map Canvas
             ↓                                                ↓
+-----------------------+                         +-----------------------+
|  Stripe Checkout/Web  |                         |  FastAPI Backend API  |
|   /api/billing/*      |                         |  FilingPulse (Railway)|
+-----------------------+                         +-----------------------+
             ↓                                                ↓
   Updates Clerk Metadata                       PostgreSQL + PostGIS (ST_Contains)
```

### Components & System Responsibilities:
* **Frontend (UI Only):** Manages user states, geocoding input, interactive polygon/circle territory drawing, and dashboard status displays. It has **no direct database access** and never exposes Stripe or Clerk secret keys.
* **Backend API (Railway):** Powers Socrata SODA data ingestion, address parsing (`usaddress`), geocoding resolution, PostGIS proximity queries, and dispatching matching email alerts.
* **Database (Supabase / Railway):** PostgreSQL with PostGIS geometry tables storing user metadata, geographic polygons (territories), and matched filings (leads).
* **Payments (Stripe + Webhooks):** Runs a serverless Next.js Route Handler webhook on Vercel to securely verify Stripe signatures, handle trial completions/payments, and cache billing statuses directly inside Clerk's user metadata.

---

## 3. Codebase Directory Map

```
C:\Users\Alexey\CascadeProjects\Portafor building permits\
├── app/                              # Next.js App Router Pages & APIs
│   ├── admin/                        # Admin Feed Health Portal
│   ├── api/                          # Next.js API Routes (Stripe)
│   │   └── billing/
│   │       ├── checkout/route.ts     # Generates Stripe Subscription sessions (30-day free trial)
│   │       ├── portal/route.ts       # Generates Stripe Customer billing portal link
│   │       ├── status/route.ts       # FAST-PATH billing status check (checks Clerk metadata, falls back to Stripe)
│   │       └── webhook/route.ts      # STRIPE WEBHOOK: Verifies signatures and syncs roles into Clerk publicMetadata
│   ├── dashboard/                    # Main Contractor Dashboard
│   │   ├── filings/                  # Radius-based leads manual search page
│   │   ├── settings/                 # Contractor Profile & Notification preferences
│   │   └── territory/                # Interactive Mapbox territory modifier
│   ├── onboarding/                   # Three-step subscriber registration with circular territory selection
│   ├── sign-in/ [[...sign-in]]/      # Clerk Sign-In wrapper
│   └── sign-up/ [[...sign-up]]/      # Clerk Sign-Up wrapper
├── components/                       # Shared Visual Components
│   ├── map/
│   │   ├── alert-map-modal.tsx       # Overlays lead pin on a static map
│   │   ├── draw-map.tsx              # HIGH PERFORMANCE Mapbox Canvas (Supports Custom Shape & 100km Circular Radius)
│   │   └── filings-map.tsx           # Displays search radius pins
│   ├── ui/                           # Base UI elements
│   │   └── field.tsx                 # Core Inputs/Selects (uses React.forwardRef for React Hook Form)
├── lib/                              # Client-side Core Logic
│   ├── api.ts                        # Unified Fetch Utility (toggles custom X-Subscriber-Key or Clerk Auth)
│   ├── schemas.ts                    # Zod validation boundary schemas
│   ├── types.ts                      # Strict TypeScript interfaces
│   └── use-subscriber.ts             # Custom query hooks and dev test-key fallbacks
```

---

## 4. API & Integration Contract

The frontend Next.js application communicates securely with the FastAPI backend through `NEXT_PUBLIC_API_URL` using two distinct authorization models:

### A. Authorization Headers
1. **Subscriber APIs (`GET /subscribers/{id}`, `GET /filings`)**:
   Authenticate using custom header: `X-Subscriber-Key: <subscriber_api_key>` (generated upon successful onboarding).
2. **Onboarding & Admin APIs (`POST /subscribers`, `GET /jurisdictions/{id}/health`)**:
   Authenticate using standard Bearer Token: `Authorization: Bearer <clerk_session_token>`.

### B. Endpoint Spec

| Route | Method | Auth Header Required | Purpose | Input | Output |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/subscribers` | `POST` | `Authorization: Bearer` | Registers/onboards subscriber | `SubscriberPayload` | `Subscriber` JSON with `api_key` |
| `/subscribers/{id}` | `GET` | `X-Subscriber-Key` | Fetches contractor profile + alerts | — | `Subscriber` JSON |
| `/filings` | `GET` | `X-Subscriber-Key` | Runs radius proximity searches | `near=lat,lng`, `radius_km` | `Filing[]` array |
| `/jurisdictions` | `POST` | `Authorization: Bearer` | Registers a municipal feed | SODA configurations | `JurisdictionHealth` JSON |
| `/jurisdictions/{id}/health`| `GET` | `Authorization: Bearer` | Checks active poller health status | — | `JurisdictionHealth` JSON |

---

## 5. Main Developer Flows & Code Lifecycle

### User Sign-Up & Onboarding Flow
1. **User Sign Up:** Registers via Clerk at `/sign-up`, redirecting to `/onboarding`.
2. **Business Profile:** Steps through business name and segment filters validated via Zod schemas.
3. **Circular Service Radius (Step 2 - Default):** Center address geocodes to coordinates. The slider generates a circular polygon (up to 100km).
4. **Subscription Activation (Step 3):** Calls `POST /subscribers` (Bearer Auth) to save the subscriber's service area in PostgreSQL. Next, redirects user to checkout, establishing a 30-day free trial on Stripe. Webhook updates Clerk metadata to `active`.

### Geodesic Circle Math (`lib/utils.ts`)
Mapbox rendering and PostGIS containment require valid `Polygon` geometry. The frontend calculates circle vertices programmatically using geodesic math:
```typescript
export function createCirclePolygon(center: [number, number], radiusKm: number, points = 32): GeoJSON.Polygon {
  const coordinates: [number, number][] = [];
  const distanceX = radiusKm / (111.32 * Math.cos((center[1] * Math.PI) / 180));
  const distanceY = radiusKm / 110.574;

  for (let i = 0; i < points; i++) {
    const angle = (i / points) * (2 * Math.PI);
    const lng = center[0] + distanceX * Math.cos(angle);
    const lat = center[1] + distanceY * Math.sin(angle);
    coordinates.push([lng, lat]);
  }
  coordinates.push(coordinates[0]); // Closes loop

  return { type: "Polygon", coordinates: [coordinates] };
}
```

---

## 6. Stripe Webhook Architecture & Fast-Path Status Check

Stripe events are received at `/api/billing/webhook` to manage billing changes without hitting the database:

```
Stripe Webhook event
       ↓
Verify Signature (STRIPE_WEBHOOK_SECRET)
       ↓
Case: checkout.session.completed / invoice.paid
       ↓
Extract clerk_user_id (client_reference_id)
       ↓
Clerk Backend SDK updates user publicMetadata: { plan: "Starter Yearly", status: "active" }
```

### The Fast-Path Billing Status Check (`app/api/billing/status/route.ts`)
Instead of requesting Stripe on every dashboard render (which is rate-limited and slow), the system performs a multi-tier check:
1. **Fast Path:** Query Clerk backend SDK to fetch user's `publicMetadata`. If a valid `plan` exists, return it instantly (0 latency, 0 Stripe rate-limit usage).
2. **Slow Path / Fallback:** If Clerk metadata is empty, search Stripe customers via `metadata['clerk_user_id']`, list their subscriptions, and compute the plan.

---

## 7. Business & Technical Rules

* **Default Radius:** 10 km (enforced as circular geometry during Step 2). Can expand dynamically up to **100 km**.
* **Database Is Source of Truth:** Geometries must always be stored in kilometers and closed properly.
* **Refs in custom inputs:** Inputs, Selects, and Textareas in `components/ui/field.tsx` **MUST** use `React.forwardRef`. Dropping refs breaks React Hook Form tracking and keeps buttons locked in "Required" state.
* **No Client Secrets:** `STRIPE_SECRET_KEY` and `CLERK_SECRET_KEY` must never be used or printed on the client-side. They reside strictly in serverless Route Handlers (`app/api/*`).

---

## 8. AI Developer Directives (CRUCIAL)

When working on this codebase, you **MUST** adhere to the following:

1. **Type Safety First:** Never bypass or suppress TypeScript compiler errors. Always check code using `npx tsc --noEmit` before proposing changes.
2. **Quality Checks:** Run `npm run lint` before committing.
3. **No Direct Database Queries from Frontend:** The Next.js client does not hold Postgres connections. Always communicate with the database via the API endpoints defined in `lib/api.ts`.
4. **Local Testing Fallbacks:** If testing locally without fully populated Clerk metadata, `lib/use-subscriber.ts` automatically maps numeric Subscriber IDs to default test keys:
   * Subscriber ID `1` / `austin` → `austin_roofing_test_api_key_abc123`
   * Subscriber ID `2` / `dallas` → `dallas_hvac_test_api_key_xyz789`
5. **No Duplicate Logic:** Avoid rewriting API calls. Always centralize requests in `lib/api.ts` and use React Query hooks.
6. **Protect Secrets:** Never stage or edit `.env.example` with active keys (Stripe `sk_live`, Clerk `sk_test`). Always use your local `.env.local` which is git-ignored.
