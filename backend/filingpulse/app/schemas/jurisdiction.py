"""
app/schemas/jurisdiction.py
===========================
Pydantic v2 request/response schemas for the /jurisdictions endpoints.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class JurisdictionCreate(BaseModel):
    """Request body for ``POST /jurisdictions`` (admin only)."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=255, examples=["City of Austin, TX"])
    source_type: str = Field(
        ...,
        pattern=r"^(socrata|manual)$",
        description="Adapter type: 'socrata' or 'manual'.",
    )
    config: dict[str, Any] = Field(
        ...,
        description=(
            "Adapter-specific configuration JSON.  "
            "For Socrata: {domain, resource_id, app_token?, date_column, field_map, "
            "dataset_type: 'permit'|'license', poll_interval_seconds}."
        ),
    )
    active: bool = Field(default=True)


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class JurisdictionOut(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: int
    name: str
    source_type: str
    active: bool
    created_at: datetime
    # Config is returned without sensitive fields (app_token redacted)
    config: dict[str, Any]


class JurisdictionHealthOut(BaseModel):
    """Response for ``GET /jurisdictions/{id}/health``."""

    model_config = ConfigDict(extra="forbid", from_attributes=True)

    jurisdiction_id: int
    jurisdiction_name: str
    active: bool
    last_polled_at: datetime | None
    last_successful_poll_at: datetime | None
    last_error: str | None
    consecutive_error_count: int
    total_filings_ingested: int
    total_quarantined: int
