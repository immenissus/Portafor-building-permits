"""
app/models/jurisdiction.py
==========================
ORM model for the ``jurisdictions`` table.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class Jurisdiction(Base, TimestampMixin):
    __tablename__ = "jurisdictions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    source_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="'socrata' | 'manual'",
    )
    # Adapter configuration stored as JSONB.
    # For Socrata: {domain, resource_id, app_token, date_column,
    #               field_map, dataset_type, poll_interval_seconds}
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # ------------------------------------------------------------------
    # Poll tracking (updated by the scheduler job)
    # ------------------------------------------------------------------
    last_polled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_successful_poll_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # ISO-8601 watermark — the adapter will only fetch records newer than this
    last_watermark: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    consecutive_error_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )

    # ------------------------------------------------------------------
    # Relationships
    # ------------------------------------------------------------------
    filings: Mapped[list["Filing"]] = relationship(  # noqa: F821
        "Filing", back_populates="jurisdiction", lazy="select"
    )
    quarantined_filings: Mapped[list["QuarantinedFiling"]] = relationship(  # noqa: F821
        "QuarantinedFiling", back_populates="jurisdiction", lazy="select"
    )

    def __repr__(self) -> str:
        return f"<Jurisdiction id={self.id} name={self.name!r}>"
