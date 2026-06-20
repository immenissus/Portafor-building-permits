"""
app/api/subscribers.py
======================
FastAPI routes for subscriber management (creating, viewing, and listing).
"""

from __future__ import annotations

import logging
import secrets
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from shapely.geometry import shape
from geoalchemy2.shape import to_shape

from .deps import get_db, verify_subscriber_api_key
from ..models.subscriber import Subscriber
from ..models.filing import Filing
from ..models.alert_sent import AlertSent
from ..schemas.subscriber import SubscriberCreate, SubscriberOut, RecentFilingOut

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/subscribers", tags=["subscribers"])


@router.post(
    "",
    response_model=SubscriberOut,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new subscriber",
)
async def create_subscriber(
    body: SubscriberCreate,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """
    Create a new subscriber with territory monitoring polygon/multipolygon
    and specific filing type filters. Generates and returns a secure, unique
    X-Subscriber-Key.
    """
    # Check if subscriber with this email already exists
    existing_stmt = select(Subscriber).where(Subscriber.email == body.email)
    existing_res = await db.execute(existing_stmt)
    if existing_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A subscriber with email {body.email!r} already exists.",
        )

    try:
        # Convert GeoJSON territory input to WKT for PostGIS ingestion
        geojson_dict = body.territory.model_dump()
        shapely_geom = shape(geojson_dict)
        wkt_geom = f"SRID=4326;{shapely_geom.wkt}"

        # Generate unique, cryptographically secure subscriber API key
        secure_key = f"sb_key_{secrets.token_urlsafe(32)}"

        subscriber = Subscriber(
            email=body.email,
            api_key=secure_key,
            business_name=body.business_name,
            business_type=body.business_type,
            territory=wkt_geom,
            filing_type_filters=[f.value for f in body.filing_type_filters],
            alert_email_enabled=body.alert_email_enabled,
        )

        db.add(subscriber)
        await db.commit()
        await db.refresh(subscriber)

        # Build response manually to handle PostGIS geometry translation to GeoJSON
        return _serialize_subscriber(subscriber, recent_filings=[])

    except Exception as e:
        logger.error("Failed to register subscriber: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid territory geometry or parameters: {e}",
        )


@router.get(
    "/{subscriber_id}",
    response_model=SubscriberOut,
    summary="Retrieve subscriber details",
)
async def get_subscriber(
    subscriber_id: int,
    subscriber: Subscriber = Depends(verify_subscriber_api_key),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """
    Fetch subscriber details, including their monitored territory and up to
    10 of their most recent matched/alerted filings. Requires X-Subscriber-Key
    header authentication matching this subscriber_id.
    """
    # Fetch recent matched filings (through alerts_sent table)
    alerts_stmt = (
        select(Filing, AlertSent.sent_at)
        .join(AlertSent, AlertSent.filing_id == Filing.id)
        .where(AlertSent.subscriber_id == subscriber_id)
        .order_by(AlertSent.sent_at.desc())
        .limit(10)
    )
    alerts_res = await db.execute(alerts_stmt)
    recent_alerts = alerts_res.all()

    recent_filings = [
        RecentFilingOut(
            id=filing.id,
            filing_type=filing.filing_type,
            address_raw=filing.address_raw,
            matched_address=filing.matched_address,
            filed_at=filing.filed_at,
            alerted_at=sent_at,
        )
        for filing, sent_at in recent_alerts
    ]

    return _serialize_subscriber(subscriber, recent_filings)


def _serialize_subscriber(
    subscriber: Subscriber,
    recent_filings: list[RecentFilingOut],
) -> dict[str, Any]:
    """Helper to safely map a Subscriber ORM model to SubscriberOut schema."""
    # Convert PostGIS geometry back to GeoJSON dict via shapely
    geom_dict = None
    if subscriber.territory is not None:
        shapely_geom = to_shape(subscriber.territory)
        geom_dict = shapely_geom.__geo_interface__

    return {
        "id": subscriber.id,
        "email": subscriber.email,
        "api_key": subscriber.api_key,
        "business_name": subscriber.business_name,
        "business_type": subscriber.business_type,
        "filing_type_filters": subscriber.filing_type_filters,
        "alert_email_enabled": subscriber.alert_email_enabled,
        "created_at": subscriber.created_at,
        "territory": geom_dict,
        "recent_filings": recent_filings,
    }
