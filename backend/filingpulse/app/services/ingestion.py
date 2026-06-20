"""
app/services/ingestion.py
=========================
Ingestion pipeline service for FilingPulse.
Processes raw records through remapping, validation, address parsing,
geocoding, persistence, spatial matching, and email notifications.
"""

from __future__ import annotations

import logging
import traceback
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.notification import Notification
from ..models.jurisdiction import Jurisdiction
from ..models.filing import Filing
from ..models.quarantined_filing import QuarantinedFiling
from ..models.alert_sent import AlertSent
from ..schemas.raw_socrata import RawSocrataPermit, RawSocrataLicense
from ..schemas.normalized import NormalizedFiling, FilingType
from .address_parser import parse_address
from .geocoder import CensusGeocoder, GeocoderError
from .matcher import find_matches_for_filing

logger = logging.getLogger(__name__)


def _remap_row(row: dict[str, Any], field_map: dict[str, str]) -> dict[str, Any]:
    """
    Map Socrata custom columns to FilingPulse canonical fields using the
    jurisdiction-specific field map.
    """
    remapped = {}
    for key, value in row.items():
        # Map if present in field_map; otherwise preserve as-is (goes to extra)
        mapped_key = field_map.get(key, key)
        remapped[mapped_key] = value
    return remapped


async def ingest_raw_record(
    session: AsyncSession,
    raw_record: dict[str, Any],
    jurisdiction: Jurisdiction,
    geocoder: CensusGeocoder,
    notifier: EmailNotifier,
) -> Filing | QuarantinedFiling:
    """
    Ingest a single raw record from a jurisdiction's data feed.

    Executes the following pipeline:
      1. Remap fields based on jurisdiction config & validate against raw Pydantic schemas.
      2. Parse the messy address string using the ``usaddress`` parser.
      3. Resolve coordinates using the free US Census Geocoder API.
      4. Validate the canonical ``NormalizedFiling`` schema.
      5. Insert into the database (with upsert/deduplication support).
      6. Query spatial/filtering matching logic for active subscribers.
      7. Trigger alert dispatch and record in ``alerts_sent`` to prevent duplicates.

    If any validation, parsing, or geocoding step fails, the raw record is saved
    to the ``quarantined_filings`` table with the full traceback for auditing.

    Returns
    -------
    Filing | QuarantinedFiling
        The saved database model (either successfully processed or quarantined).
    """
    external_id: str | None = None
    config = jurisdiction.config
    field_map = config.get("field_map", {})
    dataset_type = config.get("dataset_type", "permit")

    try:
        # Step 1: Remap and validate against the boundary raw model
        remapped = _remap_row(raw_record, field_map)

        if dataset_type == "permit":
            raw_model = RawSocrataPermit.model_validate(remapped)
            external_id = raw_model.permit_number
            filing_type_raw = raw_model.permit_type
            raw_address = raw_model.address
            filed_at = raw_model.issued_date
        elif dataset_type == "license":
            raw_model = RawSocrataLicense.model_validate(remapped)
            external_id = raw_model.license_number
            filing_type_raw = raw_model.license_type
            raw_address = raw_model.address
            filed_at = raw_model.issued_date
        else:
            raise ValueError(f"Unsupported dataset_type in jurisdiction config: {dataset_type!r}")

        # Step 2: Parse messy US address using usaddress wrapper
        parsed_address = parse_address(raw_address)

        # Step 3: Geocode coordinates.
        # Use existing coordinates in the raw model if available and within CONUS bounds
        latitude = raw_model.latitude
        longitude = raw_model.longitude
        matched_address = raw_address

        # Check if coordinates are missing or if we need to fall back to Geocoding API
        needs_geocoding = True
        if latitude is not None and longitude is not None:
            # Quick bounds validation
            if 24.0 <= latitude <= 72.0 and -180.0 <= longitude <= -66.0:
                needs_geocoding = False
                matched_address = f"{raw_address} (Source Coords)"

        if needs_geocoding:
            geocoder = CensusGeocoder(db_session=session)
            # Reassemble cleaned one-line address if possible, otherwise use raw
            geocode_input = parsed_address.to_one_line() if parsed_address.is_geocodeable() else raw_address
            geocode_res = await geocoder.geocode(geocode_input)
            latitude = geocode_res.latitude
            longitude = geocode_res.longitude
            matched_address = geocode_res.matched_address

        # Step 4: Validate the canonical NormalizedFiling model
        normalized = NormalizedFiling(
            jurisdiction_id=jurisdiction.id,
            external_id=external_id,
            filing_type=filing_type_raw,  # Pydantic maps raw string to enum automatically
            filing_type_raw=filing_type_raw,
            address_raw=raw_address,
            address_number=parsed_address.address_number,
            street_name=parsed_address.street_name,
            city=parsed_address.city_name or parsed_address.place_name,
            state=parsed_address.state_name,
            zip_code=parsed_address.zip_code,
            latitude=latitude,
            longitude=longitude,
            matched_address=matched_address,
            filed_at=filed_at,
            raw_payload=raw_record,
        )

        # Check if the filing already exists to prevent duplicate insert attempts (and avoid transaction rollbacks)
        existing_stmt = select(Filing).where(
            Filing.jurisdiction_id == normalized.jurisdiction_id,
            Filing.external_id == normalized.external_id
        )
        existing_res = await session.execute(existing_stmt)
        existing_filing = existing_res.scalar_one_or_none()

        if existing_filing is not None:
            logger.info(
                "Filing already exists. Skipping insertion: [jurisdiction_id=%d, ext_id=%s, id=%s]",
                jurisdiction.id,
                external_id,
                existing_filing.id,
            )
            return existing_filing

        # Step 5: Save to database filings table
        # Using PostGIS geometry: POINT(longitude latitude)
        wkt_geom = f"SRID=4326;POINT({normalized.longitude} {normalized.latitude})"

        db_filing = Filing(
            jurisdiction_id=normalized.jurisdiction_id,
            external_id=normalized.external_id,
            filing_type=normalized.filing_type,
            filing_type_raw=normalized.filing_type_raw,
            address_raw=normalized.address_raw,
            address_number=normalized.address_number,
            street_name=normalized.street_name,
            city=normalized.city,
            state=normalized.state,
            zip_code=normalized.zip_code,
            latitude=normalized.latitude,
            longitude=normalized.longitude,
            geom=wkt_geom,
            matched_address=normalized.matched_address,
            filed_at=normalized.filed_at,
            normalized_at=normalized.normalized_at,
            raw_payload=normalized.raw_payload,
        )

        # Insert filing
        session.add(db_filing)
        await session.flush()  # Populates db_filing.id without committing
        logger.info(
            "Filing successfully ingested: [jurisdiction_id=%d, ext_id=%s, id=%s]",
            jurisdiction.id,
            external_id,
            db_filing.id,
        )

        # Step 6 & 7: Match with subscribers and notify
        subscribers = await find_matches_for_filing(session, db_filing)
        for subscriber in subscribers:
            # Enqueue notification instead of sending directly
            notification = Notification(
                subscriber_id=subscriber.id,
                filing_id=db_filing.id,
                status="pending"
            )
            session.add(notification)
            logger.info(
                "Notification queued for subscriber [id=%d] on filing [id=%d]",
                subscriber.id,
                db_filing.id,
            )

        return db_filing

    except Exception as err:
        # Something failed (validation, parsing, geocoding) -> Quarantine
        err_msg = f"{type(err).__name__}: {err}\n\nTraceback:\n{traceback.format_exc()}"
        logger.warning(
            "Filing ingestion failed, quarantining: [jurisdiction_id=%d, ext_id=%s] %s",
            jurisdiction.id,
            external_id,
            str(err),
        )

        quarantined = QuarantinedFiling(
            jurisdiction_id=jurisdiction.id,
            external_id=external_id,
            raw_payload=raw_record,
            validation_error=err_msg,
        )
        session.add(quarantined)
        await session.flush()
        return quarantined
