"""
app/api/jurisdictions.py
========================
FastAPI routes for jurisdiction management and health reporting.
"""

from __future__ import annotations

import logging
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from .deps import get_db, verify_admin_api_key
from ..models.jurisdiction import Jurisdiction
from ..models.filing import Filing
from ..models.quarantined_filing import QuarantinedFiling
from ..schemas.jurisdiction import JurisdictionCreate, JurisdictionOut, JurisdictionHealthOut

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/jurisdictions", tags=["jurisdictions"])


@router.post(
    "",
    response_model=JurisdictionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new jurisdiction (Admin Only)",
    dependencies=[Depends(verify_admin_api_key)],
)
async def create_jurisdiction(
    body: JurisdictionCreate,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """
    Register a new jurisdiction with specific adapter configuration.
    Requires the admin X-Admin-Key header.
    """
    # Check if a jurisdiction with this name already exists
    existing_stmt = select(Jurisdiction).where(Jurisdiction.name == body.name)
    existing_res = await db.execute(existing_stmt)
    if existing_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Jurisdiction with name {body.name!r} already exists.",
        )

    try:
        jurisdiction = Jurisdiction(
            name=body.name,
            source_type=body.source_type,
            config=body.config,
            active=body.active,
        )

        db.add(jurisdiction)
        await db.commit()
        await db.refresh(jurisdiction)

        return _serialize_jurisdiction(jurisdiction)

    except Exception as e:
        logger.error("Failed to register jurisdiction: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid jurisdiction configuration parameters: {e}",
        )


@router.get(
    "/{jurisdiction_id}/health",
    response_model=JurisdictionHealthOut,
    summary="Retrieve jurisdiction polling health statistics",
)
async def get_jurisdiction_health(
    jurisdiction_id: int,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """
    Get the sync status, error logging, and ingestion rates for a given
    jurisdiction's adapter.
    """
    stmt = select(Jurisdiction).where(Jurisdiction.id == jurisdiction_id)
    result = await db.execute(stmt)
    jurisdiction = result.scalar_one_or_none()

    if not jurisdiction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Jurisdiction not found.",
        )

    # Calculate statistics
    filings_count_stmt = select(func.count(Filing.id)).where(Filing.jurisdiction_id == jurisdiction_id)
    filings_count = await db.scalar(filings_count_stmt) or 0

    quarantined_count_stmt = select(func.count(QuarantinedFiling.id)).where(QuarantinedFiling.jurisdiction_id == jurisdiction_id)
    quarantined_count = await db.scalar(quarantined_count_stmt) or 0

    return {
        "jurisdiction_id": jurisdiction.id,
        "jurisdiction_name": jurisdiction.name,
        "active": jurisdiction.active,
        "last_polled_at": jurisdiction.last_polled_at,
        "last_successful_poll_at": jurisdiction.last_successful_poll_at,
        "last_error": jurisdiction.last_error,
        "consecutive_error_count": jurisdiction.consecutive_error_count,
        "total_filings_ingested": filings_count,
        "total_quarantined": quarantined_count,
    }


def _serialize_jurisdiction(jurisdiction: Jurisdiction) -> dict[str, Any]:
    """Helper to scrub sensitive credentials like Socrata app tokens in responses."""
    cleaned_config = jurisdiction.config.copy()
    if "app_token" in cleaned_config and cleaned_config["app_token"]:
        cleaned_config["app_token"] = "REDACTED"

    return {
        "id": jurisdiction.id,
        "name": jurisdiction.name,
        "source_type": jurisdiction.source_type,
        "active": jurisdiction.active,
        "created_at": jurisdiction.created_at,
        "config": cleaned_config,
    }
