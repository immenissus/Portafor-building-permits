"""
app/api/filings.py
==================
FastAPI routes for searching and viewing filings.
Includes PostGIS proximity spatial queries.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from .deps import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/filings", tags=["filings"])


class FilingSearchOut(BaseModel):
    """Schema for public/manual filing search result."""
    id: int
    jurisdiction_id: int
    external_id: str
    filing_type: str
    address_raw: str
    matched_address: str
    latitude: float
    longitude: float
    filed_at: datetime
    distance_meters: float | None = None


@router.get(
    "",
    response_model=list[FilingSearchOut],
    summary="Search for filings near a geographic coordinate (Manual Search)",
)
async def search_filings(
    near: str = Query(
        ...,
        description="Coordinates in 'latitude,longitude' format. Example: '30.2672,-97.7431'",
        pattern=r"^-?\d+(\.\d+)?, -?\d+(\.\d+)?$"
    ),
    radius_km: float = Query(
        5.0,
        description="Search radius in kilometers around the coordinates.",
        ge=0.1,
        le=100.0
    ),
    type: str | None = Query(
        None,
        description="Optional filing type enum filter (e.g. 'building_permit', 'roofing_permit')."
    ),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """
    Perform a manual geospatial search to find filings within a specified radius
    of a GPS coordinate. Results are ordered by proximity.
    """
    # Parse GPS coordinates
    try:
        lat_parts = [p.strip() for p in near.split(",")]
        latitude = float(lat_parts[0])
        longitude = float(lat_parts[1])
    except (ValueError, IndexError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query parameter 'near' must be in 'latitude,longitude' decimal format.",
        )

    # 1. Base statement
    # Create the search point geometry
    search_point = func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326)
    
    # Calculate distance using PostGIS ST_DistanceSphere (returns meters)
    distance_expr = func.ST_DistanceSphere(Filing.geom, search_point)

    stmt = (
        select(Filing, distance_expr.label("distance_meters"))
        .where(distance_expr <= (radius_km * 1000.0))
        .order_by(distance_expr.asc())
        .limit(100)  # Caps search results to protect API performance
    )

    # 2. Optional filing type filter
    if type:
        stmt = stmt.where(Filing.filing_type == type.strip().lower())

    try:
        result = await db.execute(stmt)
        rows = result.all()

        results = []
        for filing, distance_meters in rows:
            results.append(
                FilingSearchOut(
                    id=filing.id,
                    jurisdiction_id=filing.jurisdiction_id,
                    external_id=filing.external_id,
                    filing_type=filing.filing_type,
                    address_raw=filing.address_raw,
                    matched_address=filing.matched_address,
                    latitude=filing.latitude,
                    longitude=filing.longitude,
                    filed_at=filing.filed_at,
                    distance_meters=round(distance_meters, 2) if distance_meters is not None else None,
                )
            )
        return results

    except Exception as e:
        logger.error("Spatial filing search failed: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Spatial query failed: {e}",
        )
