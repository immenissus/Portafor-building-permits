"""
scripts/seed.py
===============
Seeding script to populate the local PostGIS database with test jurisdictions
and test subscribers. This enables end-to-end flow verification.

Run locally:
    python scripts/seed.py
"""

from __future__ import annotations

import asyncio
import os
import sys

from sqlalchemy import select

# Ensure workspace root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from filingpulse.app.database import get_session, dispose_engine
from filingpulse.app.models.jurisdiction import Jurisdiction
from filingpulse.app.models.subscriber import Subscriber


async def seed_jurisdictions(session) -> None:
    """Register City of Austin and City of Dallas with real/mock Socrata structures."""
    print("--> Seeding Jurisdictions...")

    # 1. City of Austin, TX (Permits feed)
    austin_name = "City of Austin, TX"
    stmt = select(Jurisdiction).where(Jurisdiction.name == austin_name)
    existing_austin = (await session.execute(stmt)).scalar_one_or_none()

    if not existing_austin:
        austin = Jurisdiction(
            name=austin_name,
            source_type="socrata",
            config={
                "source_type": "socrata",
                "domain": "data.austintexas.gov",
                "resource_id": "825e-id75",  # Placeholder resource ID
                "date_column": "issued_date",
                "field_map": {
                    "permit_number": "permit_number",
                    "permit_type": "permit_type",
                    "original_address": "address",
                    "issue_date": "issued_date",
                    "work_description": "description",
                    "permit_status": "status",
                    "contractor_name": "contractor",
                    "property_owner": "owner",
                    "project_valuation": "valuation",
                    "latitude": "latitude",
                    "longitude": "longitude",
                },
                "dataset_type": "permit",
                "poll_interval_seconds": 3600,  # 1 hour for testing
            },
            active=True,
        )
        session.add(austin)
        print(f"    Added Jurisdiction: '{austin_name}'")
    else:
        print(f"    Jurisdiction '{austin_name}' already exists.")

    # 2. City of Dallas, TX (Business Licenses feed)
    dallas_name = "City of Dallas, TX"
    stmt = select(Jurisdiction).where(Jurisdiction.name == dallas_name)
    existing_dallas = (await session.execute(stmt)).scalar_one_or_none()

    if not existing_dallas:
        dallas = Jurisdiction(
            name=dallas_name,
            source_type="socrata",
            config={
                "source_type": "socrata",
                "domain": "data.dallascityhall.com",
                "resource_id": " mock-dallas-resource",  # Placeholder resource ID
                "date_column": "issued",
                "field_map": {
                    "lic_num": "license_number",
                    "lic_type": "license_type",
                    "bus_name": "business_name",
                    "premise_addr": "address",
                    "issued": "issued_date",
                    "expire": "expiration_date",
                    "owner": "owner_name",
                    "lic_status": "status",
                    "lat": "latitude",
                    "lng": "longitude",
                },
                "dataset_type": "license",
                "poll_interval_seconds": 3600,
            },
            active=True,
        )
        session.add(dallas)
        print(f"    Added Jurisdiction: '{dallas_name}'")
    else:
        print(f"    Jurisdiction '{dallas_name}' already exists.")


async def seed_subscribers(session) -> None:
    """Register dummy subscribers with spatial bounding-box polygons."""
    print("--> Seeding Subscribers...")

    # 1. Austin Roofing contractor
    austin_email = "roofing-pro@austintest.local"
    stmt = select(Subscriber).where(Subscriber.email == austin_email)
    existing_roof = (await session.execute(stmt)).scalar_one_or_none()

    if not existing_roof:
        # Bounding box polygon covering central Austin, TX
        austin_wkt = "SRID=4326;POLYGON((-97.90 30.15, -97.60 30.15, -97.60 30.40, -97.90 30.40, -97.90 30.15))"
        roof_sub = Subscriber(
            email=austin_email,
            api_key="austin_roofing_test_api_key_abc123",
            business_name="Austin Premium Roofing LLC",
            business_type="Roofing Contractor",
            territory=austin_wkt,
            filing_type_filters=["roofing_permit", "building_permit"],
            alert_email_enabled=True,
        )
        session.add(roof_sub)
        print(f"    Added Subscriber: '{roof_sub.business_name}'")
    else:
        print(f"    Subscriber with email '{austin_email}' already exists.")

    # 2. Dallas HVAC Contractor
    dallas_email = "hvac-force@dallastest.local"
    stmt = select(Subscriber).where(Subscriber.email == dallas_email)
    existing_hvac = (await session.execute(stmt)).scalar_one_or_none()

    if not existing_hvac:
        # Bounding box polygon covering central Dallas, TX
        dallas_wkt = "SRID=4326;POLYGON((-96.95 32.65, -96.65 32.65, -96.65 32.90, -96.95 32.90, -96.95 32.65))"
        hvac_sub = Subscriber(
            email=dallas_email,
            api_key="dallas_hvac_test_api_key_xyz789",
            business_name="Dallas HVAC & Electrical Pros",
            business_type="HVAC/Electrical Contractor",
            territory=dallas_wkt,
            filing_type_filters=["mechanical_permit", "hvac_permit", "electrical_permit"],
            alert_email_enabled=True,
        )
        session.add(hvac_sub)
        print(f"    Added Subscriber: '{hvac_sub.business_name}'")
    else:
        print(f"    Subscriber with email '{dallas_email}' already exists.")


async def main() -> None:
    print("==================================================")
    print("FilingPulse Database Seeding Script")
    print("==================================================")

    try:
        # Use database async session context manager
        async with get_session() as session:
            await seed_jurisdictions(session)
            await seed_subscribers(session)
        print("\n Seeding completed successfully!")
    except Exception as e:
        print(f"\n❌ Seeding failed: {e}", file=sys.stderr)
        raise
    finally:
        # Close connection pool gracefully
        await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())
