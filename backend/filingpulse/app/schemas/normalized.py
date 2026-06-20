"""
app/schemas/normalized.py
=========================
The canonical NormalizedFiling model — the single representation that the
matching engine, notifier, and API all operate on.

Every adapter produces raw dicts; the calling service validates them into
either NormalizedFiling (success) or routes them to quarantined_filings
(validation failure).  Nothing beyond this boundary ever touches raw dicts.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# Filing-type vocabulary
# ---------------------------------------------------------------------------


class FilingType(StrEnum):
    """
    Normalised filing-type labels used across all jurisdictions.

    When an adapter encounters a filing_type not in this enum it should map
    it to UNKNOWN and include the original value in ``raw_payload``.
    Extend this enum (and add a migration) when new types are confirmed in
    production data.
    """

    BUILDING_PERMIT = "building_permit"
    DEMOLITION_PERMIT = "demolition_permit"
    ELECTRICAL_PERMIT = "electrical_permit"
    MECHANICAL_PERMIT = "mechanical_permit"
    PLUMBING_PERMIT = "plumbing_permit"
    ROOFING_PERMIT = "roofing_permit"
    SOLAR_PERMIT = "solar_permit"
    HVAC_PERMIT = "hvac_permit"
    BUSINESS_LICENSE = "business_license"
    SHORT_TERM_RENTAL = "short_term_rental"
    SIGN_PERMIT = "sign_permit"
    GRADING_PERMIT = "grading_permit"
    UNKNOWN = "unknown"


# ---------------------------------------------------------------------------
# Canonical model
# ---------------------------------------------------------------------------


class NormalizedFiling(BaseModel):
    """
    The validated, geocoded filing record passed to the matching engine.

    Design rules
    ------------
    - ``extra="forbid"`` — no silent field coercion.
    - ``external_id`` must be non-empty; use it to deduplicate on upsert.
    - ``latitude`` / ``longitude`` are always present (geocoding is a
      required step); if geocoding fails the record goes to quarantine.
    - ``raw_payload`` carries the original source dict verbatim for
      auditability / replay.
    """

    model_config = ConfigDict(extra="forbid", use_enum_values=True)

    # --- Identifiers ---
    jurisdiction_id: int = Field(..., ge=1)
    external_id: str = Field(
        ...,
        min_length=1,
        description="Unique ID assigned by the source (e.g. Socrata row ID, permit number).",
    )

    # --- Classification ---
    filing_type: FilingType = Field(
        ...,
        description="Normalised filing type from the FilingType enum.",
    )
    filing_type_raw: str | None = Field(
        None,
        description="Original un-normalised type string from the source.",
    )

    # --- Address ---
    address_raw: str = Field(
        ...,
        min_length=1,
        description="Original address string exactly as received from the source.",
    )
    address_number: str | None = None
    street_name: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None

    # --- Geocoded location ---
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    matched_address: str = Field(
        ...,
        description="Census-normalised address string returned by geocoder.",
    )

    # --- Timestamps ---
    filed_at: datetime = Field(
        ...,
        description="When the filing was issued/filed according to the source.",
    )
    normalized_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="When this record was processed by FilingPulse.",
    )

    # --- Source payload ---
    raw_payload: dict[str, Any] = Field(
        ...,
        description="Original source dict, stored verbatim for auditability.",
    )

    # ------------------------------------------------------------------
    # Validators
    # ------------------------------------------------------------------

    @field_validator("external_id", mode="before")
    @classmethod
    def _strip_external_id(cls, v: Any) -> str:
        if isinstance(v, (int, float)):
            return str(v)
        if isinstance(v, str):
            return v.strip()
        raise ValueError(f"external_id must be a string or int, got {type(v)}")

    @field_validator("filing_type", mode="before")
    @classmethod
    def _normalise_filing_type(cls, v: Any) -> str:
        """
        Accept the raw string and attempt to map it to a FilingType value.
        Falls back to UNKNOWN rather than raising — the ``filing_type_raw``
        field preserves the original for human review.
        """
        if isinstance(v, FilingType):
            return v.value
        if isinstance(v, str):
            normalised = v.lower().strip().replace(" ", "_")
            if normalised in FilingType._value2member_map_:
                return normalised
            return FilingType.UNKNOWN.value
        return FilingType.UNKNOWN.value

    @model_validator(mode="after")
    def _check_coordinates_consistency(self) -> "NormalizedFiling":
        if self.latitude == 0.0 and self.longitude == 0.0:
            raise ValueError(
                "Latitude and longitude are both 0.0 — likely a geocoder fallback. "
                "Quarantine this record."
            )
        return self


# ---------------------------------------------------------------------------
# Quarantine schema
# ---------------------------------------------------------------------------


class QuarantinedFilingIn(BaseModel):
    """
    Written to quarantined_filings when validation or geocoding fails.
    The raw_payload is stored as-is; validation_error carries the full
    Pydantic / exception traceback so the issue can be diagnosed later.
    """

    model_config = ConfigDict(extra="forbid")

    jurisdiction_id: int
    external_id: str | None = None
    raw_payload: dict[str, Any]
    validation_error: str = Field(
        ..., description="Full error message / traceback from the failed validation."
    )
    quarantined_at: datetime = Field(default_factory=datetime.utcnow)
