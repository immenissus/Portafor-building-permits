"""
app/schemas/address.py
======================
Pydantic v2 model representing the structured output of usaddress.tag().

usaddress returns a list of (value, label) tuples; we repack them into
this model.  Unknown/extra labels are captured in ``extra_components``
rather than silently dropped — if a field we depend on (e.g. ZipCode) is
missing, callers should decide whether to quarantine the record.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ParsedAddress(BaseModel):
    """
    Structured US address components produced by the usaddress library.

    Fields map to usaddress USPS component labels.
    See: https://usaddress.readthedocs.io/en/latest/#labels
    All fields are optional because messy real-world addresses may be
    missing many components.
    """

    model_config = ConfigDict(extra="forbid")

    # --- Building/unit ---
    address_number: str | None = Field(None, alias="AddressNumber")
    address_number_prefix: str | None = Field(None, alias="AddressNumberPrefix")
    address_number_suffix: str | None = Field(None, alias="AddressNumberSuffix")

    # --- Street ---
    street_name_pre_directional: str | None = Field(
        None, alias="StreetNamePreDirectional"
    )
    street_name_pre_modifier: str | None = Field(None, alias="StreetNamePreModifier")
    street_name_pre_type: str | None = Field(None, alias="StreetNamePreType")
    street_name: str | None = Field(None, alias="StreetName")
    street_name_post_directional: str | None = Field(
        None, alias="StreetNamePostDirectional"
    )
    street_name_post_modifier: str | None = Field(None, alias="StreetNamePostModifier")
    street_name_post_type: str | None = Field(None, alias="StreetNamePostType")

    # --- Sub-address ---
    subaddress_identifier: str | None = Field(None, alias="SubaddressIdentifier")
    subaddress_type: str | None = Field(None, alias="SubaddressType")

    # --- Landmark / place ---
    building_name: str | None = Field(None, alias="BuildingName")
    landmark_name: str | None = Field(None, alias="LandmarkName")
    place_name: str | None = Field(None, alias="PlaceName")

    # --- City / State / Zip ---
    city_name: str | None = Field(None, alias="CityName")
    state_name: str | None = Field(None, alias="StateName")
    zip_code: str | None = Field(None, alias="ZipCode")
    zip_plus4: str | None = Field(None, alias="ZipPlus4")

    # --- Occupancy ---
    occupancy_type: str | None = Field(None, alias="OccupancyType")
    occupancy_identifier: str | None = Field(None, alias="OccupancyIdentifier")

    # --- Recipient ---
    recipient: str | None = Field(None, alias="Recipient")

    # --- usaddress address type (Street Address, PO Box, Intersection) ---
    address_type: str | None = Field(
        None,
        description="Top-level address type returned by usaddress.tag()",
    )

    # --- Raw one-line input (for debugging / quarantine messages) ---
    raw_input: str | None = Field(None, description="Original unparsed address string")

    @model_validator(mode="after")
    def _fallback_city_name(self) -> ParsedAddress:
        if not self.city_name and self.place_name:
            self.city_name = self.place_name
        return self

    # ------------------------------------------------------------------
    # Convenience
    # ------------------------------------------------------------------

    def to_one_line(self) -> str:
        """
        Re-assemble a cleaned single-line address suitable for geocoding.
        Omits occupancy / recipient components that confuse geocoders.
        """
        parts = filter(
            None,
            [
                self.address_number,
                self.street_name_pre_directional,
                self.street_name,
                self.street_name_post_type,
                self.street_name_post_directional,
                self.city_name,
                self.state_name,
                self.zip_code,
            ],
        )
        return " ".join(parts)

    def is_geocodeable(self) -> bool:
        """Return True if we have at least a street number + name + city/zip."""
        has_street = bool(self.address_number and self.street_name)
        has_locality = bool(self.city_name or self.zip_code)
        return has_street and has_locality
