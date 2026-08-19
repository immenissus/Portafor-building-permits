# Portafor — frontend agent prompt

## What you are building

You are building **Portafor**, a web application dashboard for local service businesses (roofers, HVAC contractors, solar installers, insurance agents, lawyers). Portafor monitors government open-data feeds — building permits, business licenses — and sends email alerts when new filings appear inside a subscriber's defined service territory.

There is no marketing site. The entire product is the authenticated dashboard. A user lands on `/login`, signs in, and is taken directly to their workspace.

---

## Tech stack (non-negotiable)

- **Next.js 14** with App Router (`/app` directory)
- **Tailwind CSS** for all styling
- **shadcn/ui** for all UI components — install via `npx shadcn-ui@latest add`
- **Clerk** for authentication (sign-up, sign-in, session management, JWT)
- **Mapbox GL JS** + `@mapbox/mapbox-gl-draw` for the territory map
- **Stripe** (hosted Checkout + Customer Portal) for billing
- **Recharts** for any charts or sparklines
- **React Hook Form** + **Zod** for all form validation
- **TanStack Query** (`@tanstack/react-query`) for all API data fetching and caching

Do not introduce any additional libraries without explicit instruction.

---

## Backend API

The backend is a FastAPI application. All requests go to `process.env.NEXT_PUBLIC_API_URL`. Every request must include the header:

```
Authorization: Bearer <clerk_session_token>
```

Retrieve the token with Clerk's `useAuth()` hook: `const { getToken } = useAuth()`.

### Endpoints

#### Subscribers

```
POST /subscribers
```
Register the current user as a subscriber.
Request body:
```json
{
  "business_name": "string",
  "business_type": "string",  // one of: roofer, hvac, solar, insurance, lawyer, other
  "filing_type_filters": ["building_permit", "business_license"],
  "service_area": {
    "type": "Polygon",  // or MultiPolygon — standard GeoJSON
    "coordinates": [[[lng, lat], ...]]
  }
}
```

```
GET /subscribers/{id}
```
Returns subscriber metadata plus up to 10 recent alerts.
Response shape:
```json
{
  "id": "uuid",
  "business_name": "string",
  "business_type": "string",
  "filing_type_filters": ["string"],
  "service_area": { "type": "Polygon", "coordinates": [...] },
  "created_at": "ISO8601",
  "recent_alerts": [
    {
      "id": "uuid",
      "filing_type": "building_permit",
      "address": "123 Main St, Springfield, IL",
      "filed_at": "ISO8601",
      "lat": 39.7817,
      "lng": -89.6501,
      "raw_data": {}
    }
  ]
}
```

#### Jurisdictions (admin only)

```
POST /jurisdictions
```
Requires header `X-Admin-Key: <value from env>`. Creates a new jurisdiction data feed.

```
GET /jurisdictions/{id}/health
```
Returns sync diagnostics.
Response shape:
```json
{
  "jurisdiction_id": "uuid",
  "name": "string",
  "last_polled_at": "ISO8601 or null",
  "last_success_at": "ISO8601 or null",
  "consecutive_failures": 0,
  "total_ingested": 1240,
  "total_quarantined": 3
}
```

#### Filings (manual search)

```
GET /filings?near=lat,lng&radius_km=5.0&type=building_permit
```
Returns filings near a point.
Response shape:
```json
[
  {
    "id": "uuid",
    "filing_type": "building_permit",
    "address": "string",
    "filed_at": "ISO8601",
    "lat": 0.0,
    "lng": 0.0
  }
]
```

---

## Application structure

```
/app
  layout.tsx              — root layout: Clerk provider, TanStack Query provider, global nav
  page.tsx                — redirects to /dashboard if signed in, else to /sign-in
  sign-in/[[...sign-in]]/ — Clerk hosted sign-in page
  sign-up/[[...sign-up]]/ — Clerk hosted sign-up page
  onboarding/             — first-run flow for new users (see below)
  dashboard/
    page.tsx              — main alerts feed
    territory/page.tsx    — draw / edit service area
    filings/page.tsx      — manual filing search
    settings/page.tsx     — profile, notification prefs, billing
  admin/
    page.tsx              — jurisdiction list + health (gated by Clerk role)
```

All routes under `/dashboard` and `/admin` are protected. Use Clerk middleware (`middleware.ts`) to redirect unauthenticated users to `/sign-in`.

---

## Onboarding flow (`/onboarding`)

New users who have no subscriber record land here. It is a 3-step wizard:

**Step 1 — Business details**
Fields: Business name (text), Business type (select: Roofer, HVAC, Solar installer, Insurance agent, Lawyer, Other), Filing types to watch (checkboxes: Building permits, Business licenses — both checked by default).

**Step 2 — Draw your territory**
Full-width Mapbox map. The user draws a polygon using `@mapbox/mapbox-gl-draw` in `draw_polygon` mode. Show a helper tooltip: "Draw the area you serve. Click to place points, click the first point to close the shape." Do not allow proceeding without a closed polygon.

**Step 3 — Confirm & activate**
Summary card showing business name, type, filing filters, and a static map preview of the drawn territory (use Mapbox Static Images API). A single "Activate alerts" CTA button that calls `POST /subscribers` and redirects to `/dashboard` on success.

Progress is shown as a three-step pill indicator at the top. Steps are not skippable.

---

## Dashboard (`/dashboard`)

The main screen. Layout: left sidebar nav + right content area.

### Sidebar
- Portafor wordmark at top (use a clean sans-serif logotype, no icon needed)
- Nav links: Alerts, Territory, Search filings, Settings
- At the bottom: user avatar (from Clerk) + name + "Sign out" link
- On mobile: collapses to a bottom tab bar with icons only

### Alerts feed (main content)
Header row: "Recent alerts" title + a filter dropdown (All types / Building permits / Business licenses).

Each alert is a card with:
- Filing type badge (pill): "Building permit" in blue, "Business license" in green
- Address as the primary text (16px, medium weight)
- Relative timestamp ("3 hours ago") as secondary text
- A small inline map thumbnail using Mapbox Static Images API centered on the filing coordinates (180×100px, zoom 14)
- A subtle "View on map" link that opens a modal with a full Mapbox map centered on the filing, with a pin

Empty state: friendly illustration placeholder + "No alerts yet — we're watching your territory" + a small note about polling frequency.

Loading state: skeleton cards (use shadcn/ui Skeleton).

---

## Territory page (`/dashboard/territory`)

Full-page Mapbox map. If the user already has a service_area polygon, render it as a filled layer (`fill-color: #3B8BD4, fill-opacity: 0.2`, `line-color: #185FA5, line-width: 2`).

Toolbar above the map:
- "Edit territory" button — enables `@mapbox/mapbox-gl-draw`, loads existing polygon into the draw layer
- "Save" button (shown only in edit mode) — calls `POST /subscribers` with the updated geometry, shows a toast on success
- "Cancel" button (shown only in edit mode) — reverts to saved state

---

## Filings search (`/dashboard/filings`)

Two-panel layout: left panel is a search form, right panel is a Mapbox map.

Search form fields:
- Address input with a "Use my location" button (Geolocation API)
- Radius slider: 1–25 km, default 5 km
- Filing type select: All / Building permits / Business licenses
- "Search" button

On submit, call `GET /filings?near=lat,lng&radius_km=X&type=Y` (geocode the address input first using Mapbox Geocoding API). Render results as pins on the map. Clicking a pin shows a popup with address, filing type, and date. Also render results as a scrollable list below the form; hovering a list item highlights the corresponding map pin.

---

## Settings (`/dashboard/settings`)

Three sections rendered as stacked cards:

**Profile**
Read-only display of business name, type, and Clerk email. An "Edit" link opens an inline form to update business name and type (calls `POST /subscribers` with updated values).

**Notification preferences**
Toggle switches (shadcn/ui Switch):
- Email alerts: on/off (default on)
- Alert digest frequency: Instant / Daily digest (radio)

These preferences are stored client-side in localStorage for now — no backend endpoint exists yet. Label them clearly as "saved on this device."

**Billing**
Show current plan name and status from a local state variable (fetch from Stripe via a Next.js API route `/api/billing/status` which calls the Stripe API server-side). A "Manage billing" button links to the Stripe Customer Portal session (generated by `/api/billing/portal`). A "Upgrade" button (if on free plan) links to Stripe Checkout (generated by `/api/billing/checkout`).

---

## Admin panel (`/admin`)

Visible only to users with Clerk `role: admin` metadata. 

A table of jurisdictions. Each row shows: jurisdiction name, last polled timestamp, last success timestamp, consecutive failures (shown in red if > 0), total ingested, total quarantined (shown in amber if > 0). Data fetched from `GET /jurisdictions/{id}/health` for each jurisdiction.

A "Add jurisdiction" button opens a modal form with fields: Name, Socrata domain, Resource ID, App token, Column field map (JSON textarea). Submits to `POST /jurisdictions` with `X-Admin-Key` header.

---

## Visual design direction

The aesthetic is **approachable and local** — this is a tool for contractors and small business owners, not enterprise software. Avoid cold corporate blues and dense data tables.

Specific direction:
- **Typeface:** Inter or Geist (both available via next/font). Body 14–15px, relaxed line-height (1.6).
- **Color palette:** Warm off-white background (`#FAFAF8`), not pure white. Primary action color: a friendly teal (`#0F766E` — Tailwind `teal-700`). Accent: warm amber (`#B45309` — Tailwind `amber-700`) for badges and highlights. Avoid cold grays — use warm gray (`stone-*` Tailwind scale).
- **Cards:** Slightly rounded (`rounded-xl`), subtle shadow (`shadow-sm`), `1px solid` warm border (`stone-200`). Not flat, not elevated — tactile.
- **Filing type badges:** Building permit → `bg-sky-100 text-sky-800`. Business license → `bg-emerald-100 text-emerald-800`.
- **Icons:** Lucide React throughout. Keep icon usage purposeful — nav items, empty states, and status indicators only.
- **Tone of microcopy:** Conversational, not technical. "We're watching your territory" not "Monitoring active." "Something went wrong — try again" not "Error 500."
- **Map style:** Use Mapbox `mapbox://styles/mapbox/streets-v12` (warm, readable street map — feels local, not satellite-data-heavy).

---

## Error handling & edge cases

- All API calls must have loading, success, and error states handled explicitly.
- Network errors: show a shadcn/ui Toast with a retry button.
- 401 responses: clear Clerk session and redirect to `/sign-in`.
- 422 validation errors from the API: map field errors back to the React Hook Form field they belong to.
- If `GET /subscribers/{id}` returns 404 (new user, no record yet): redirect to `/onboarding`.
- Mapbox map must handle the case where the user denies geolocation — fall back to a default map center (geographic center of the continental US: `[-98.5795, 39.8283]`).

---

## Environment variables required

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_API_URL=https://your-railway-backend.up.railway.app
NEXT_PUBLIC_MAPBOX_TOKEN=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_STARTER_PRICE_ID=
STRIPE_PRO_PRICE_ID=
NEXT_PUBLIC_ADMIN_API_KEY=   # only for admin panel usage
```

---

## What not to build

Do not build:
- A marketing or landing page
- A blog or docs section
- A mobile native app
- Any server-side polling or background jobs (that is entirely the backend's responsibility)
- A custom email template editor (email templates are managed in Resend/react.email separately)
- Multi-seat / team / organization features
- Any Stripe billing UI beyond the three elements described in Settings (status display, portal link, checkout link)

---

## Definition of done

The build is complete when:
1. A new user can sign up, complete onboarding, draw a territory, and reach the alerts dashboard.
2. An existing user can sign in and see their alert feed.
3. The territory page renders the saved polygon and allows editing.
4. The filings search page returns and maps results for a given address and radius.
5. The settings page shows billing status and opens the Stripe portal.
6. The admin panel is accessible to admin-role users and shows jurisdiction health data.
7. The app is deployed to Vercel and communicates successfully with the Railway backend.
8. All routes are protected by Clerk middleware — no unauthenticated access to any `/dashboard` or `/admin` route.