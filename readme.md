# Portafor Frontend

Portafor is the authenticated dashboard for the FilingPulse backend described in `backend readme.md`. It gives local service businesses a workspace for drawing their service territory, receiving matching building-permit and business-license alerts, searching filings manually, managing notification preferences, and checking billing.

There is no marketing site in this frontend. The root route redirects signed-in users to `/dashboard` and everyone else to Clerk sign-in.

## Backend Contract

The app talks to the FastAPI backend through `NEXT_PUBLIC_API_URL`. Every backend request sends:

```http
Authorization: Bearer <clerk_session_token>
```

The frontend expects the backend to provide:

- `POST /subscribers` for onboarding and territory/profile updates.
- `GET /subscribers/{id}` for dashboard data and recent alerts.
- `GET /filings?near=lat,lng&radius_km=5.0&type=building_permit` for manual search.
- `POST /jurisdictions` and `GET /jurisdictions/{id}/health` for the admin feed-health panel.

The frontend uses Clerk for identity, Mapbox for maps/geocoding/static previews, TanStack Query for API caching, React Hook Form and Zod for validation, Stripe server routes for checkout/customer portal links, and Tailwind/shadcn-style UI primitives for the interface.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required environment variables:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_API_URL=https://your-railway-backend.up.railway.app
NEXT_PUBLIC_MAPBOX_TOKEN=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_STARTER_PRICE_ID=
STRIPE_PRO_PRICE_ID=
NEXT_PUBLIC_ADMIN_API_KEY=
```

## Routes

- `/sign-in` and `/sign-up`: Clerk authentication.
- `/onboarding`: three-step subscriber setup with business details, Mapbox polygon drawing, and activation.
- `/dashboard`: recent matched alerts with filtering and map previews.
- `/dashboard/territory`: service-area viewing and editing.
- `/dashboard/filings`: address/geolocation search with map pins and result list.
- `/dashboard/settings`: profile, local notification preferences, and Stripe billing actions.
- `/admin`: Clerk `role: admin` gated jurisdiction health and registration.

## Notes

The backend brief exposes `GET /subscribers/{id}` but does not define a `GET /me/subscriber` endpoint. This frontend uses the Clerk user id as the initial lookup key and stores the returned subscriber id in Clerk unsafe metadata after onboarding.
