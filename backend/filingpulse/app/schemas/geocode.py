"""
app/schemas/geocode.py
======================
Pydantic v2 model for the US Census Bureau Geocoding API response.

Endpoint (no API key required):
  https://geocoding.geo.census.gov/geocoder/locations/onelineaddress
  ?address=<encoded>&benchmark=Public_AR_Current&format=json

We parse only the fields we actually use.  The full Census response is
richer; unused fields are captured in ``extra_fields`` so we never
silently discard data.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


# ---------------------------------------------------------------------------
# Nested sub-models (strict — only fields we depend on)
# ---------------------------------------------------------------------------


class CensusCoordinates(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Census may add fields

    x: float = Field(..., description="Longitude (WGS-84)")
    y: float = Field(..., description="Latitude (WGS-84)")


class CensusAddressComponents(BaseModel):
    model_config = ConfigDict(extra="ignore")

    fromAddress: str | None = None
    toAddress: str | None = None
    preQualifier: str | None = None
    preDirection: str | None = None
    preType: str | None = None
    streetName: str | None = None
    suffixType: str | None = None
    suffixDirection: str | None = None
    suffixQualifier: str | None = None
    city: str | None = None
    state: str | None = None
    zip: str | None = None


class CensusAddressMatch(BaseModel):
    model_config = ConfigDict(extra="ignore")

    matchedAddress: str
    coordinates: CensusCoordinates
    addressComponents: CensusAddressComponents | None = None
    tigerLine: dict[str, Any] | None = None


class CensusResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    input: dict[str, Any] | None = None
    addressMatches: list[CensusAddressMatch] = Field(default_factory=list)


class CensusApiResponse(BaseModel):
    """
    Top-level Census geocoder response wrapper.

    Usage::

        raw = requests.get(CENSUS_URL, params=...).json()
        resp = CensusApiResponse.model_validate(raw)
        if not resp.result.addressMatches:
            raise GeocoderNoMatchError(address)
        match = resp.result.addressMatches[0]
    """

    model_config = ConfigDict(extra="ignore")

    result: CensusResult


# ---------------------------------------------------------------------------
# Canonical output model used throughout the app
# ---------------------------------------------------------------------------


class GeocodeResult(BaseModel):
    """
    The canonical geocoded location returned by ``services/geocoder.py``.

    This is what the rest of the application sees — not the raw Census
    response.  ``longitude`` and ``latitude`` are WGS-84 decimal degrees.
    """

    model_config = ConfigDict(extra="forbid")

    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    matched_address: str = Field(
        ..., description="The Census-normalised address string"
    )
    source: str = Field(
        default="census_geocoder",
        description="Identifier of the geocoding service used",
    )

    @model_validator(mode="after")
    def _check_continental_us(self) -> "GeocodeResult":
        """
        Loose sanity check: coordinates should be inside a bounding box that
        covers the contiguous US + AK + HI.  Rejects obviously bad results
        (e.g. (0, 0) returned when the Census API has no match).
        """
        lat, lng = self.latitude, self.longitude
        in_conus = 24.0 <= lat <= 72.0 and -180.0 <= lng <= -66.0
        if not in_conus:
            raise ValueError(
                f"Geocoded coordinates ({lat}, {lng}) are outside expected US bounds. "
                "Verify the address or the Census API response."
            )
        return self
