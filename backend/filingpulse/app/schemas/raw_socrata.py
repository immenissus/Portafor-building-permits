"""
app/schemas/raw_socrata.py
==========================
Strict Pydantic v2 boundary models for Socrata SODA API responses.

Anti-hallucination rule: these models define the *shape* we expect from a
Socrata dataset, NOT a specific city's schema.  Each jurisdiction's adapter
configures which field names map to which canonical fields via its
``field_map`` config dict (see socrata_adapter.py).

Two base classes cover the two common dataset types:
- ``RawSocrataPermit``  — building / mechanical / roofing / solar permits
- ``RawSocrataLicense`` — business licenses / registrations

Because Socrata datasets vary wildly in their column names, both models use
``model_config = ConfigDict(extra="allow")`` so unexpected columns are
preserved in ``model_extra`` rather than causing a hard failure.

However, the adapter MUST map the raw row through its ``field_map`` before
constructing these models, so the *canonical* field names (address, filed_at,
etc.) are always populated.  Fields that cannot be mapped go to ``model_extra``.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ---------------------------------------------------------------------------
# Shared mixin
# ---------------------------------------------------------------------------


class _SocrataRowMixin(BaseModel):
    """
    Fields common to almost every Socrata row.
    Adapters should map the source column for ``:id`` → ``socrata_row_id``.
    """

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    socrata_row_id: str | None = Field(
        None,
        alias=":id",
        description="Socrata internal row identifier (the ':id' meta-column).",
    )

    @field_validator("socrata_row_id", mode="before")
    @classmethod
    def _coerce_row_id(cls, v: Any) -> str | None:
        if v is None:
            return None
        return str(v).strip() or None


# ---------------------------------------------------------------------------
# Permit model
# ---------------------------------------------------------------------------


class RawSocrataPermit(_SocrataRowMixin):
    """
    Represents one row from a Socrata building-permits dataset after the
    adapter has remapped columns to canonical names.

    Field-mapping happens in ``SocrataAdapter._remap_row()`` — this model
    is the result of that remapping, not the raw Socrata row.

    Required canonical fields (must be present after remapping):
      - ``permit_number``  : the jurisdiction's own permit ID
      - ``permit_type``    : raw type string (e.g. "Building", "Roofing")
      - ``address``        : full civic address as a single string
      - ``issued_date``    : when the permit was issued

    Optional canonical fields:
      - ``description``    : permit description / work summary
      - ``status``         : permit status (issued, pending, finaled, …)
      - ``contractor``     : contractor name
      - ``owner``          : property owner name
      - ``valuation``      : declared project valuation (dollars)
      - ``latitude`` / ``longitude`` : pre-geocoded coords (some datasets have these)
    """

    # Required
    permit_number: str = Field(..., min_length=1)
    permit_type: str = Field(..., min_length=1)
    address: str = Field(..., min_length=1)
    issued_date: datetime

    # Optional
    description: str | None = None
    status: str | None = None
    contractor: str | None = None
    owner: str | None = None
    valuation: float | None = None
    latitude: float | None = None
    longitude: float | None = None

    @field_validator("issued_date", mode="before")
    @classmethod
    def _parse_date(cls, v: Any) -> datetime:
        if isinstance(v, datetime):
            return v
        if isinstance(v, str):
            # Socrata ISO-8601 timestamps sometimes include timezone info
            v = v.strip()
            for fmt in (
                "%Y-%m-%dT%H:%M:%S.%f",
                "%Y-%m-%dT%H:%M:%S",
                "%Y-%m-%d",
            ):
                try:
                    return datetime.strptime(v, fmt)
                except ValueError:
                    continue
        raise ValueError(f"Cannot parse issued_date from: {v!r}")

    @field_validator("valuation", mode="before")
    @classmethod
    def _parse_valuation(cls, v: Any) -> float | None:
        if v is None or v == "":
            return None
        try:
            return float(str(v).replace(",", "").replace("$", "").strip())
        except (ValueError, TypeError):
            return None

    @field_validator("permit_number", "permit_type", "address", mode="before")
    @classmethod
    def _strip_str(cls, v: Any) -> str:
        if isinstance(v, str):
            return v.strip()
        return str(v).strip()


# ---------------------------------------------------------------------------
# Business license model
# ---------------------------------------------------------------------------


class RawSocrataLicense(_SocrataRowMixin):
    """
    Represents one row from a Socrata business-licenses dataset after the
    adapter has remapped columns to canonical names.

    Required canonical fields:
      - ``license_number`` : jurisdiction's own license ID
      - ``license_type``   : raw type string
      - ``business_name``  : name of the business
      - ``address``        : licensed location address
      - ``issued_date``    : when the license was issued / approved

    Optional canonical fields:
      - ``expiration_date``
      - ``owner_name``
      - ``status``
      - ``latitude`` / ``longitude``
    """

    # Required
    license_number: str = Field(..., min_length=1)
    license_type: str = Field(..., min_length=1)
    business_name: str = Field(..., min_length=1)
    address: str = Field(..., min_length=1)
    issued_date: datetime

    # Optional
    expiration_date: datetime | None = None
    owner_name: str | None = None
    status: str | None = None
    latitude: float | None = None
    longitude: float | None = None

    @field_validator("issued_date", "expiration_date", mode="before")
    @classmethod
    def _parse_date(cls, v: Any) -> datetime | None:
        if v is None or v == "":
            return None
        if isinstance(v, datetime):
            return v
        if isinstance(v, str):
            v = v.strip()
            for fmt in (
                "%Y-%m-%dT%H:%M:%S.%f",
                "%Y-%m-%dT%H:%M:%S",
                "%Y-%m-%d",
            ):
                try:
                    return datetime.strptime(v, fmt)
                except ValueError:
                    continue
        raise ValueError(f"Cannot parse date from: {v!r}")

    @field_validator("license_number", "license_type", "business_name", "address", mode="before")
    @classmethod
    def _strip_str(cls, v: Any) -> str:
        if isinstance(v, str):
            return v.strip()
        return str(v).strip()
