"""
app/models/filing.py
====================
ORM model for the ``filings`` table using GeoAlchemy2 for PostGIS.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geometry

from .base import Base


class Filing(Base):
    __tablename__ = "filings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    jurisdiction_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("jurisdictions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    external_id: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True,
    )

    # --- Classification ---
    filing_type: Mapped[str] = mapped_column(String(50), nullable=False)
    filing_type_raw: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # --- Address ---
    address_raw: Mapped[str] = mapped_column(Text, nullable=False)
    address_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    street_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(50), nullable=True)
    zip_code: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # --- Geocoded Coordinates & Location ---
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)

    # PostGIS geometry column for point location
    geom = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, spatial_index=True),
        nullable=False,
    )

    matched_address: Mapped[str] = mapped_column(Text, nullable=False)

    # --- Timestamps ---
    filed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )
    normalized_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )

    # --- Raw JSON Payload ---
    raw_payload: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # ------------------------------------------------------------------
    # Unique constraint & Relationships
    # ------------------------------------------------------------------
    __table_args__ = (
        UniqueConstraint("jurisdiction_id", "external_id", name="uq_filings_jurisdiction_external"),
    )

    jurisdiction: Mapped["Jurisdiction"] = relationship(  # noqa: F821
        "Jurisdiction", back_populates="filings", lazy="select"
    )
    alerts_sent: Mapped[list["AlertSent"]] = relationship(  # noqa: F821
        "AlertSent",
        back_populates="filing",
        cascade="all, delete-orphan",
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<Filing id={self.id} ext_id={self.external_id!r} type={self.filing_type!r}>"
