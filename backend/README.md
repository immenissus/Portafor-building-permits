# FilingPulse

FilingPulse is a production-ready, high-performance FastAPI application designed to monitor local government open-data feeds (e.g., building permits, business licenses) and alert subscribed local-service businesses (roofers, HVAC, solar installers, lawyers, insurance agents) when new filings match their defined monitored service areas and filing-type filters.

---

## Architecture Overview

FilingPulse uses a robust, modular architectural pattern to ingest and process data feeds with near-zero infrastructure footprint:

```
+-----------------------------------------------------------+
|                      FilingPulse API                      |
|                                                           |
|  POST /subscribers   GET /subscribers/{id}                |
|  POST /jurisdictions GET /jurisdictions/{id}/health       |
|  GET /filings (manual search via PostGIS ST_Distance)     |
+-----------------------------------------------------------+
                             |
                             |  polls
                             v
+-----------------------------------------------------------+
|               In-Process APScheduler Job                  |
+-----------------------------------------------------------+
                             |
                             |  fetches SODA API
                             v
+-----------------------------------------------------------+
|              Generic SocrataAdapter (sodapy)              |
+-----------------------------------------------------------+
                             |
                             |  yields raw row
                             v
+-----------------------------------------------------------+
|                     Ingestion Pipeline                     |
|                                                           |
| 1. Column Remapping & Pydantic Boundary Validation         |
| 2. Address Component Parsing (usaddress wrapper)          |
| 3. US Census Geocoding (coordinates resolution)           |
| 4. Canonical Model Validation (NormalizedFiling)          |
+-----------------------------------------------------------+
                             |
                             v
              +-------------------------------+
              |   Postgres + PostGIS Database  |
              +-------------------------------+
                             |
                             |  triggers
                             v
+-----------------------------------------------------------+
|                      Matching Engine                      |
|                                                           |
|  - GeoAlchemy2 Spatial Containment Query (ST_Contains)    |
|  - Array Overlap Filtering for Filing Types               |
|  - Deduplication tracking (alerts_sent table)             |
+-----------------------------------------------------------+
                             |
                             |  dispatches
                             v
+-----------------------------------------------------------+
|             Transactional Email Notifier                  |
|                                                           |
|  SMTP / TLS (Default with Mailhog support) OR Resend API   |
+-----------------------------------------------------------+
```

---

## Hard Constraints & Safety Rules

1. **Anti-Hallucination on Dataset Identifiers:** No guessing or hardcoding Socrata resource IDs. Configurable values are supplied per jurisdiction via `/jurisdictions` admin registration.
2. **Pydantic Validation Boundaries:** Raw record keys are mapped into strict boundary Pydantic v2 schemas (`RawSocrataPermit` / `RawSocrataLicense`). Any unparseable records are written to `quarantined_filings` with full traceback logs, ensuring system stability.
3. **Watermark Polling:** Periodic polling relies on a per-jurisdiction watermark datetime instead of "last 24h" queries, allowing self-recovery after system downtime.
4. **Local Geocoding Cache:** Local lookup table (`address_cache`) stores geocoding bounds of clean addresses, reducing external US Census API requests by 80-95% for duplicate rows.
5. **Decoupled Notification Queue:** Rather than dispatching emails synchronously during ingestion, unmatched items are safely written to a database-backed `notifications` queue. An async polling worker asynchronously dispatches these tasks, isolating Resend/SMTP network issues and guaranteeing delivery.
6. **Strict Ingestion Idempotency:** The database level composite constraint `uq_filings_jurisdiction_external` on (`jurisdiction_id`, `external_id`) guarantees that duplicated records are ignored gracefully without triggering redundant transactions or double-alerting.

---

## Tech Stack

- **Python 3.12**
- **FastAPI** — high-performance REST framework.
- **Pydantic v2** — strict boundary verification.
- **PostgreSQL + PostGIS** — spatial proximity indexing.
- **SQLAlchemy 2.0 (async)** + **Alembic** — database modeling and migrations.
- **APScheduler** — in-process periodic polling (keeping operations footprint lightweight).
- **geoalchemy2** & **shapely** — spatial geometry mapping and conversion.
- **usaddress** — probabilistic US postal address parser.
- **sodapy** — official Socrata SODA client wrapper.

---

## API Endpoints

### Subscribers
- `POST /subscribers` — Registers a new subscriber, complete with business name, business type, filing filters, and monitored service area boundary (accepted as standard GeoJSON Polygon or MultiPolygon).
- `GET /subscribers/{id}` — Returns detailed metadata about a subscriber, including their territory and up to 10 of their most recent matched filing alerts.

### Jurisdictions
- `POST /jurisdictions` — Registers a new jurisdiction with config metadata (domain, resource_id, app_token, column field map). Requires `X-Admin-Key` header authentication.
- `GET /jurisdictions/{id}/health` — Returns comprehensive sync diagnostics (last polled, last success, consecutive failure counts, total ingested, and total quarantined).

### Filings
- `GET /filings?near=lat,lng&radius_km=5.0&type=building_permit` — Manual search endpoint allowing users to locate filings within a radial distance from a given point, using `ST_DistanceSphere` proximity queries.

---

## Frontend Integration & API Key Binding

FilingPulse acts as a secure JSON REST API middleware between your database and the frontend dashboard (React, Next.js, Vue, etc.). The frontend never communicates directly with PostgreSQL; instead, it uses subscriber API keys to securely authorize requests.

### 1. Where to Find API Keys for the Frontend

#### During Local Development & Testing
You can find pre-seeded development subscriber API keys in the database seed script (`scripts/seed.py`). 
The standard test API keys loaded by default are:
* **Austin Subscriber (ID: 1):** `austin_roofing_test_api_key_abc123`
* **Dallas Subscriber (ID: 2):** `dallas_hvac_test_api_key_xyz789`

#### In Production
When a new customer signs up, your frontend makes a request to `POST /subscribers`. The response will contain an automatically generated, cryptographically secure API key prefixed with `sb_key_` (e.g., `sb_key_p1N6R7x...`). 
Save this key securely on the client-side (e.g., local storage, cookies, or state manager) to authorize all subsequent requests.

### 2. Binding the Key and Authenticating Frontend Requests

To retrieve a subscriber's monitored territory, recent matched alerts, and profile details, the frontend must make an HTTP `GET` request and include the API key in the custom header: `X-Subscriber-Key`.

#### Example Fetch Implementation (React/JavaScript)
```javascript
import React, { useEffect, useState } from 'react';

function SubscriberDashboard({ subscriberId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  // In real applications, load this from LocalStorage or your Auth Provider
  const SUBSCRIBER_API_KEY = "austin_roofing_test_api_key_abc123"; 

  useEffect(() => {
    fetch(`http://localhost:8000/subscribers/${subscriberId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Subscriber-Key": SUBSCRIBER_API_KEY // <-- Binding the API key here
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Authentication failed or subscriber not found. Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => setData(data))
    .catch(err => setError(err.message));
  }, [subscriberId]);

  if (error) return <div className="error">Error: {error}</div>;
  if (!data) return <div className="loading">Loading dashboard...</div>;

  return (
    <div className="dashboard">
      <h1>Welcome, {data.business_name}!</h1>
      <p>Industry Segment: {data.business_type}</p>
      
      <h2>Recent Service Area Alerts</h2>
      <ul>
        {data.recent_alerts.map((alert, index) => (
          <li key={index}>
            <strong>{alert.filing_type}</strong> - {alert.address_raw} ({alert.filed_at})
          </li>
        ))}
      </ul>
    </div>
  );
}

export default SubscriberDashboard;
```

---

## Local Development & Setup

### 1. Configure Environmental Variables
Create a `.env` file in the project root:
```env
ENVIRONMENT=development
DEBUG=true
SECRET_KEY=yoursecretkeyofatleastthirtytwocharacterslong
ADMIN_API_KEY=admin_api_key_filingpulse_secure_token

# Local Postgres with PostGIS URL
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/filingpulse

# Email Configurations
EMAIL_BACKEND=smtp
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_FROM_ADDRESS=alerts@filingpulse.local
SMTP_FROM_NAME=FilingPulse Alerts
```

### 2. Run with Docker Compose
Start the PostGIS database, the FastAPI server, and a Mailhog developer SMTP inbox:
```bash
docker-compose up --build
```
- Interactive OpenAPI Docs: [http://localhost:8000/docs](http://localhost:8000/docs)
- Mailhog SMTP Web Inbox (view alerts locally): [http://localhost:8025](http://localhost:8025)

### 3. Database Migrations
Initialize database tables with Alembic:
```bash
# Inside the api container, or locally with virtualenv active:
alembic upgrade head
```

### 4. Running Tests
Run the test suite:
```bash
pytest tests/
```

---

## Scaling: Swapping to Celery & Redis

The current FilingPulse scheduler runs as an in-process thread using `APScheduler`. This setup maintains a near-zero infrastructure cost, which is ideal for MVPs and small-scale deployment.

As ingestion volume and active jurisdictions scale, you can easily decouple periodic syncs from the web server using **Celery** and **Redis**:

1. **Install Celery & Redis:**
   Add `celery==5.4.0` and `redis==5.0.4` to your `requirements.txt`.
2. **Setup Celery Application:**
   Create a `celery_app.py` worker configuration:
   ```python
   from celery import Celery

   celery = Celery(
       "filingpulse",
       broker="redis://redis:6379/0",
       backend="redis://redis:6379/0",
   )
   ```
3. **Decouple the Lifespan Hooks:**
   Remove `start_scheduler()` and `shutdown_scheduler()` from `app/main.py`.
4. **Port the Scheduler Job to Celery Tasks:**
   In `app/jobs/scheduler.py`, wrap `run_poll_job` in a Celery task decorator:
   ```python
   @celery.task
   def run_poll_job_celery(jurisdiction_id: int):
       # Execute the exact same routine inside the background worker
       asyncio.run(run_poll_job(jurisdiction_id))
   ```
5. **Configure periodic polling schedule:**
   Setup `celery-beat` scheduler to trigger `run_poll_job_celery` for registered active jurisdictions at specific intervals.
6. **Update `docker-compose.yml`:**
   Add a Redis service container and split your container stack into:
   - `api`: running uvicorn
   - `celery_worker`: running `celery -A celery_app.celery worker`
   - `celery_beat`: running `celery -A celery_app.celery beat`

---

## AI Developer Context & Backend Guide

This section provides comprehensive context and architectural rules specifically designed for AI agents onboarding to this codebase. By studying this section alone, you should understand the entire backend layout, technical dependencies, data flows, and constraints.

### 1. High-Level Core Concept
FilingPulse is a backend geo-proximity SaaS engine that:
1. **Polls Open-Data Feeds:** Periodically fetches building permits and business licenses from city portals using **Socrata (SODA) APIs** (configured in the `jurisdictions` table).
2. **Parses & Geocodes Addresses:** Uses a probabilistic parser (`usaddress`) to structure messy postal strings, then queries a local database `address_cache` to resolve coordinates. On cache misses, it queries the free **US Census Bureau Geocoder API** and caches the result.
3. **Spatial Proximity Matching:** Evaluates if a new filing falls inside any contractor's monitored territory (stored as PostGIS Polygon/MultiPolygon geometries in the `subscribers` table) using PostGIS `ST_Contains` spatial intersection queries.
4. **Reliable Buffered Alerting:** Instead of sending notifications synchronously during ingestion, matched alert tasks are queued into the `notifications` buffer table. An asynchronous polling worker (`notification_worker`) periodically dispatches these alerts via **Resend API** or **SMTP**, ensuring no alerts are lost if external APIs go down.

---

### 2. Core Package Architecture (`filingpulse/app/`)

The application is structured into a clean, modular regular package layout:

* **`adapters/`**
  Handles external open-data ingestion. Subclasses `JurisdictionAdapter` to handle SODA credentials, field mapping, and pagination watermarks dynamically.
* **`api/`**
  FastAPI route handlers.
  * `deps.py`: Contains JWT/API key validation middleware. Front-end requests are authenticated using custom request headers (`X-Subscriber-Key`).
  * `subscribers.py`, `jurisdictions.py`, `filings.py`: Standard CRUD controllers.
* **`jobs/`**
  Background worker execution.
  * `scheduler.py`: Tracks and schedules periodic jurisdiction poll tasks.
  * `notification_worker.py`: Polling engine that processes queued `notifications` and transmits them via SMTP/Resend.
* **`models/`**
  SQLAlchemy 2.0 ORM declarations. All models inherit from `app.models.base.Base`. Includes GeoAlchemy2 `Geometry` fields (e.g. `POINT` and `POLYGON` under SRID 4326).
* **`schemas/`**
  Pydantic v2 boundary schema declarations handling raw data sanitization, serialization, and type coercion.
* **`services/`**
  Core decoupled business rules:
  * `address_parser.py`: Wraps `usaddress` to separate street, city, state, zip.
  * `geocoder.py`: Manages latitude/longitude lookups and local table caching.
  * `matcher.py`: Core PostGIS proximity queries.
  * `notifier.py`: Abstract SMTP/Resend notification dispatch client.

---

### 3. Database Schema Models

* **`Jurisdiction` (`jurisdictions`):** Tracks SODA datasets, watermark timestamps, and integration sync metrics.
* **`Subscriber` (`subscribers`):** Tracks contractors, their specific filtered filing types, and their polygon-based service territory (`Geometry("POLYGON", srid=4326)`).
* **`Filing` (`filings`):** Stores ingested permits with physical Point locations (`Geometry("POINT", srid=4326)`). 
  * *Idempotency Rule:* Governed by a strict unique constraint `uq_filings_jurisdiction_external` over (`jurisdiction_id`, `external_id`) to prevent duplicate ingestion.
* **`AddressCache` (`address_cache`):** Key-value lookup table hashing cleaned address strings to prevent redundant external geocoder queries.
* **`Notification` (`notifications`):** Database-backed task queue storing pending emails with state management columns (`status`, `error_message`, `sent_at`).
* **`AlertSent` (`alerts_sent`):** Simple join table ensuring subscribers are never double-alerted for the same filing.

---

### 4. Rigid Coding and Architecture Constraints

As an AI developer, you **MUST** strictly adhere to the following conventions:

1. **Intra-Package Imports (PEP 8 Relative):** Any imports *inside* the `filingpulse/app/` package referencing sibling modules must use relative import notation. Never write absolute `app.xxx` imports inside the package.
   * *Correct:* `from ..config import get_settings`
   * *Incorrect:* `from app.config import get_settings`
2. **External Imports (Absolute):** Imports from files *outside* the package (such as `tests/`, `scripts/`, or `alembic/`) referencing the core application must be fully-qualified absolute imports.
   * *Correct:* `from filingpulse.app.config import get_settings`
3. **No PYTHONPATH Manipulation:** Do not insert `sys.path.insert(...)` hacks inside tests, migrations, or scripts, and do not rely on `PYTHONPATH` overrides. Standardize module paths so they resolve naturally from the workspace root.
4. **Alembic Prepend Path:** Keep `prepend_sys_path = .` in `alembic.ini` so that Alembic loads resources from the repository root directory.
5. **Database Connections:** Always use the `postgresql+asyncpg://` protocol prefix for database URLs. Standard synchronous `postgresql://` drivers will fail in this async codebase.
6. **No Custom Start Commands on Railway:** Never define a custom launch/start command on Railway's dashboard. Let the `Dockerfile` natively handle application startup through its built-in `CMD` instruction, which binds to port `$PORT` dynamically.
7. **Pydantic v2 Style:** Use Pydantic v2 settings and validators (`@field_validator` and `@model_validator(mode="after")`).

