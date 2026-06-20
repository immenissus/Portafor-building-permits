
Build a production-ready FastAPI application called "FilingPulse" (placeholder name).

GOAL
Monitor local government open-data feeds (building permits, business
licenses) and alert subscribed local-service businesses (roofers, HVAC,
solar, lawyers, insurance agents, etc.) when a new filing matches their
service area and filing-type filters.

HARD CONSTRAINTS — ANTI-HALLUCINATION RULES (follow exactly)
1. NEVER invent a Socrata dataset resource ID, city portal URL, or API
   endpoint. If you don't have a verified one, write the adapter against
   an injected/configurable resource_id and leave a TODO + raise
   NotImplementedError("verify resource_id for <city>") instead of
   guessing. I will supply verified resource IDs separately, looked up
   via the real Socrata Discovery API (https://api.us.socrata.com/api/catalog/v1).
2. Use sodapy (pip install sodapy) for Socrata access. It's archived but
   stable — fine to use as-is. Only fall back to raw requests calls
   against the documented SODA REST + SoQL query syntax if sodapy can't
   do something, and say explicitly when you do this.
3. Every external record (API response, scraped row) must be parsed into
   a strict Pydantic v2 model at the boundary. Unparseable/unexpected
   fields should fail validation and go to a quarantined_filings table
   — never get silently coerced or "filled in."
4. Pin every dependency to an exact version in requirements.txt. Do not
   use unpinned "latest."
5. Write tests using responses or vcrpy against real recorded HTTP
   fixtures (I will provide one real sample API response per
   jurisdiction) — not synthetic data you invent.
6. New jurisdictions are added by subclassing a JurisdictionAdapter
   ABC. The core engine (matching, alerting, storage) must never touch
   a raw API response directly — only validated Pydantic models.

STACK
- Python 3.12, FastAPI, Pydantic v2
- Postgres + PostGIS extension (geospatial proximity matching)
- SQLAlchemy 2.0 (async) + Alembic for migrations
- APScheduler for periodic polling (NOT Celery/Redis — keep infra cost
  near zero for MVP; note in README how to swap to Celery+Redis later)
- sodapy for Socrata-powered jurisdictions
- 
- usaddress (pip install usaddress) for parsing messy US address strings
  into structured components before geocoding
- US Census Bureau Geocoding Services API (free, no key) as the primary
  geocoder — call it via plain requests, do not invent a different
  geocoding endpoint
- Resend or plain SMTP for transactional email; mention listmonk
  (open-source, self-hostable) in README as a no-cost alternative for
  higher volume
- Docker + docker-compose (app + postgres/postgis)

DATA MODEL
- jurisdictions (id, name, source_type: "socrata"|"manual", config JSON)
- subscribers (id, email, business_type, territory: PostGIS geometry,
  filing_type_filters: text[])
- filings (id, jurisdiction_id, external_id, filing_type, address,
  geom: PostGIS point, raw_payload JSONB, filed_at, normalized_at)
- quarantined_filings (same shape + validation_error text)
- alerts_sent (subscriber_id, filing_id, sent_at) — unique constraint to
  prevent duplicate alerts

WORKFLOW
1. APScheduler job polls each active jurisdiction adapter on its own
   configured interval (default: daily; respect each source's actual
   update cadence, don't assume real-time).
2. Adapter fetches new records since last successful poll (use a
   per-jurisdiction watermark timestamp, not "last 24h" blindly).
3. Each raw record → usaddress parse → Census geocode → Pydantic
   validation → insert into filings or quarantined_filings.
4. Matching engine: for each new filing, find subscribers whose
   territory (PostGIS ST_DWithin / ST_Contains) and filing_type_filters
   match, excluding subscribers already alerted for that filing.
5. Queue + send alert email; record in alerts_sent.


ENDPOINTS
POST /subscribers          — create subscriber + territory + filters
GET  /subscribers/{id}     — view subscriber + recent matched filings
POST /jurisdictions        — register a jurisdiction (admin only)
GET  /jurisdictions/{id}/health  — last successful poll, error count
GET  /filings?near=lat,lng&radius_km=&type=  — manual search (no auth, rate-limited)

FOLDER STRUCTURE
filingpulse/
├── app/
│   ├── main.py
│   ├── api/ (subscribers.py, jurisdictions.py, filings.py)
│   ├── adapters/
│   │   ├── base.py            # JurisdictionAdapter ABC
│   │   └── socrata_adapter.py # generic Socrata implementation
│   ├── services/
│   │   ├── address_parser.py  # usaddress wrapper
│   │   ├── geocoder.py        # Census API wrapper
│   │   ├── matcher.py         # PostGIS matching logic
│   │   └── notifier.py
│   ├── models/ (sqlalchemy models)
│   ├── schemas/ (pydantic models — one per external source shape)
│   └── jobs/scheduler.py
├── tests/
│   ├── fixtures/ (recorded real API responses, one per jurisdiction)
│   └── test_adapters.py
├── alembic/
├── docker-compose.yml
├── requirements.txt (pinned)
└── README.md

MVP SCOPE — phase 1 only
Implement real adapters for jurisdictions confirmed to run on Socrata
with a known permits/licenses dataset — I will supply the verified
resource IDs for 3 cities to start. Do NOT attempt non-Socrata portals
(e.g. Accela-based city sites) in phase 1 — those need fragile scraping
and are explicitly out of scope until the Socrata-only MVP is validated.

Provide complete source code. Generate files one by one.
Start with the JurisdictionAdapter ABC and Pydantic schemas before
anything else, since those are the contracts everything else depends on.