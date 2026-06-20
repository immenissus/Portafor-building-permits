"""
app/schemas/subscriber.py
=========================
Pydantic v2 request/response schemas for the /subscribers endpoints.

Territory is accepted as a GeoJSON geometry object (Polygon or MultiPolygon)
in the request body.  The API layer converts it to a WKT string before
storing in PostGIS.  GeoJSON is chosen because it's the natural format for
web map clients (Leaflet, Mapbox, Google Maps).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from .normalized import FilingType


# ---------------------------------------------------------------------------
# GeoJSON geometry sub-types (minimal — only Polygon + MultiPolygon needed)
# ---------------------------------------------------------------------------


class GeoJsonPolygon(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["Polygon"]
    coordinates: list[list[list[float]]] = Field(
        ...,
        description=(
            "Array of rings; first ring is exterior, subsequent rings are holes. "
            "Each position is [longitude, latitude]."
        ),
    )

    @field_validator("coordinates")
    @classmethod
    def _at_least_one_ring(cls, v: list) -> list:
        if not v:
            raise ValueError("Polygon coordinates must have at least one ring.")
        for ring in v:
            if len(ring) < 4:
                raise ValueError(
                    "Each ring must have at least 4 positions (first == last to close)."
                )
        return v


class GeoJsonMultiPolygon(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["MultiPolygon"]
    coordinates: list[list[list[list[float]]]]


class GeoJsonPoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["Point"]
    coordinates: list[float] = Field(..., min_length=2, max_length=3)

    @property
    def longitude(self) -> float:
        return self.coordinates[0]

    @property
    def latitude(self) -> float:
        return self.coordinates[1]


# Union type accepted as territory input
TerritoryGeometry = GeoJsonPolygon | GeoJsonMultiPolygon


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class SubscriberCreate(BaseModel):
    """
    Request body for ``POST /subscribers``.

    ``territory`` should be a GeoJSON Polygon or MultiPolygon describing the
    geographic area the subscriber wants to monitor.  Use a tool like
    geojson.io to draw the polygon.

    ``filing_type_filters`` is a list of FilingType enum values.  An empty
    list means "match all filing types."
    """

    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    business_name: str = Field(..., min_length=1, max_length=255)
    business_type: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Free-text descriptor, e.g. 'roofing contractor', 'solar installer'.",
    )
    territory: TerritoryGeometry = Field(
        ...,
        description="GeoJSON Polygon or MultiPolygon defining the service area to monitor.",
    )
    filing_type_filters: list[FilingType] = Field(
        default_factory=list,
        description="Filing types to receive alerts for.  Empty list = all types.",
    )
    alert_email_enabled: bool = Field(
        default=True,
        description="Whether to send email alerts (can be toggled later).",
    )


class SubscriberUpdate(BaseModel):
    """
    Request body for ``PATCH /subscribers/{id}``.
    All fields are optional — only supplied fields are updated.
    """

    model_config = ConfigDict(extra="forbid")

    business_name: str | None = Field(None, min_length=1, max_length=255)
    business_type: str | None = Field(None, min_length=1, max_length=100)
    territory: TerritoryGeometry | None = None
    filing_type_filters: list[FilingType] | None = None
    alert_email_enabled: bool | None = None


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class RecentFilingOut(BaseModel):
    """Slim filing representation embedded in subscriber response."""

    model_config = ConfigDict(extra="forbid")

    id: int
    filing_type: str
    address_raw: str
    matched_address: str
    filed_at: datetime
    alerted_at: datetime


class SubscriberOut(BaseModel):
    """Full subscriber response including recent matched filings."""

    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: int
    email: str
    api_key: str
    business_name: str
    business_type: str
    filing_type_filters: list[str]
    alert_email_enabled: bool
    created_at: datetime
    # Territory is returned as GeoJSON geometry dict
    territory: dict[str, Any] | None = None
    recent_filings: list[RecentFilingOut] = Field(default_factory=list)
