# RoofLead

Lead generation SaaS for roofing contractors.

Users define territories, receive homeowner leads, and manage subscriptions.

* **Frontend:** Next.js (Vercel)
* **Backend:** Express.js (Railway)
* **Database:** PostgreSQL (Supabase)
* **Payments:** Stripe subscriptions with free trials
* **Maps:** Google Maps API / Mapbox

---

## 2. Architecture

```
Frontend (Vercel)
       ↓
Backend API (Railway)
       ↓
Supabase Database (PostgreSQL)
  ↙    ↓     ↘
Stripe Webhooks  Mapbox/Google Maps
```

### Responsibilities:
* **Frontend:** Handles user interface, maps display, territory definition (Circular/Polygon), settings toggles, and Clerk authentication redirects. Contains no business logic or payment processing code.
* **Backend:** Handles authentication parsing, Stripe checkout/portal session generation, billing webhooks processing, and lead matching algorithms.
* **Database:** Stores users, territories (GeoJSON geometries), leads, and subscription status as the ultimate source of truth.
* **Stripe:** Subscriptions and billing management.

---

## 3. Folder Structure

### Directories:
* `app/` — Next.js App Router pages and page layouts.
* `components/` — Reusable, visual UI components (fields, buttons, map loaders).
* `lib/` — API fetch utilities, types, schemas, and helper utilities.
* `hooks/` — React Query and authentication hooks.
* `backend/` (or FastAPI `api/`) — Backend microservices.
  * `routes/` — REST API endpoints.
  * `controllers/` — Request handlers and validations.
  * `services/` — Heavy business logic (ingestion pipelines, matching engines).
  * `middleware/` — Role verification and JWT validation middlewares.
* `database/` — Database schemas and migrations.
  * `sql/` — DDL schemas and local tables creation.

---

## 4. Database Schema

### Tables Structure:

#### Users
* `id` (UUID / text) — Primary Key, maps to Clerk/Auth ID.
* `email` (varchar) — User contact email.
* `stripe_customer_id` (varchar) — Stripe billing profile link.
* `subscription_status` (varchar) — Subscription status (`active`, `past_due`, `cancelled`).

#### Territories
* `id` (integer / UUID) — Primary Key.
* `user_id` (UUID / text) — Foreign Key to Users.
* `service_area` (Geometry / PostGIS Polygon) — Spatial boundary representing the contractor's territory.
* `latitude` (numeric) — Center latitude for circular radius.
* `longitude` (numeric) — Center longitude for circular radius.
* `radius_km` (numeric) — Coverage radius in kilometers.

#### Leads
* `id` (integer) — Primary Key.
* `address` (varchar) — Physical raw location.
* `geom` (Geometry / PostGIS Point) — Geocoded coordinates of the filing.
* `status` (varchar) — `new`, `matched`, `dispatched`.

---

## 5. API Endpoints

### `/auth/login` & `/auth/signup`
* **Purpose:** Registers/signs in a user and provisions metadata.
* **Input:** Clerk authentication tokens / user email.
* **Output:** User JSON record.

### `/checkout/create-session` (frontend: `/api/billing/checkout`)
* **Purpose:** Generates a secure, 30-day free trial Stripe Checkout session.
* **Input:** Clerk token.
* **Output:** Stripe session checkout URL.

### `/territories` (frontend: `/subscribers`)
* **Purpose:** Fetches or upserts a subscriber's service area.
* **Input:** Subscriber geometry payload (Polygon or MultiPolygon).
* **Output:** Updated subscriber profile.

### `/leads` (frontend: `/filings`)
* **Purpose:** Performs proximity or radius-based queries of matched filings.
* **Input:** Coordinates near a point (`lat,lng`) and a `radius_km` slider value.
* **Output:** Array of matching filings.

### `/stripe/webhook` (frontend: `/api/billing/webhook`)
* **Purpose:** Synchronizes payment failures, cancellations, and trial completions.
* **Input:** Raw payload with `stripe-signature` header.
* **Output:** `{ received: true }`.

---

## 6. Main User Flows

### Onboarding & Signup Flow
```
User registers (Clerk)
       ↓
Fills out business metadata
       ↓
Creates circular service territory (Default center, radius up to 100km)
       ↓
Stripe 30-day free trial subscription starts
       ↓
Subscription set as Active
       ↓
Receives matched permit / license leads
```

### Lead Matching Algorithm
```
New Permit/License lead is ingested
       ↓
Query PostGIS database to find overlapping service areas (ST_Contains)
       ↓
Filter users with "active" subscription status only
       ↓
Assign lead to matching contractors
       ↓
Dispatch notification email/alerts to subscribers
```

---

## 7. Environment Variables

* `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` — Configures user sessions and backend token validations.
* `NEXT_PUBLIC_API_URL` — Address of the backend API service.
* `NEXT_PUBLIC_MAPBOX_TOKEN` — Mapbox token for interactive maps and static overlays.
* `NEXT_PUBLIC_ADMIN_API_KEY` / `ADMIN_API_KEY` — Restricts jurisdiction registration.
* `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — Manages subscriptions and verifies webhook signature keys.
* `STRIPE_STARTER_PRICE_ID` — Links to your year/monthly subscription price.

---

## 8. Business Rules

* **One territory has one center and radius:** Calculated as a 32-sided polygon approximation of a circle.
* **Default radius:** 10 km (can expand up to 100 km).
* **No Overlapping Territories:** Users are validated against creating overlapping service zones in their profiles.
* **Active Subscriptions:** Active territories require a valid subscription.
* **Matched Access:** Leads are strictly dispatched only to contractors with active, paying, or trialing accounts.

---

## 9. Current Tech Stack

* **Frontend:** Next.js (React), TypeScript, Tailwind CSS, Mapbox GL
* **Backend:** Express.js / Node.js
* **Database:** PostgreSQL (PostGIS) / Supabase
* **Hosting:** Vercel (Frontend), Railway (Backend)
* **Payments:** Stripe

---

## 10. Known Issues / TODO

* No SMS notification dispatcher.
* Complex polygon intersection validation incomplete.
* Stripe Webhook retry and queue failover worker.

---

## 11. Development Principles

* **Business Logic:** Belongs strictly in the backend services.
* **Security:** Frontend never holds, prints, or exposes Stripe secret keys or Clerk secret tokens.
* **Modularity:** UI components should be highly reusable.
* **APIs:** All API response payloads must be cleanly formatted using `camelCase`.

---

## 12. Important Files

* `app/api/billing/webhook/route.ts` — Receives and verifies Stripe webhook events to update user roles.
* `app/api/billing/checkout/route.ts` — Creates Stripe checkout sessions with a 30-day free trial.
* `app/onboarding/page.tsx` — Onboarding workflow with circular radius selection up to 100km.
* `components/map/draw-map.tsx` — Interactive Mapbox canvas rendering polygons and radius circles.

---

## AI Context

This is a lead-generation SaaS for roofing contractors.

### Crucial Directives:
* **Frontend contains no business logic.** Keep validations and math scoped.
* **Stripe secrets live only on the backend** / server-side route handlers.
* **Territory radius is stored in kilometers.**
* **PostgreSQL (PostGIS) is the ultimate source of truth.**
* **Subscription status determines service area matching access.**
* **Never duplicate logic already in services/.**
* **Prefer modifying existing files over creating new ones.**
