"""
app/models/quarantined_filing.py
================================
ORM model for the ``quarantined_filings`` table, storing records that failed
Pydantic validation, address parsing, or geocoding.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class QuarantinedFiling(Base):
    __tablename__ = "quarantined_filings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    jurisdiction_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("jurisdictions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    external_id: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        index=True,
    )

    # Raw payload exactly as fetched from Socrata / other source
    raw_payload: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # Detailed error message / exception traceback
    validation_error: Mapped[str] = mapped_column(Text, nullable=False)

    quarantined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )

    # ------------------------------------------------------------------
    # Relationships
    # ------------------------------------------------------------------
    jurisdiction: Mapped["Jurisdiction"] = relationship(  # noqa: F821
        "Jurisdiction", back_populates="quarantined_filings", lazy="select"
    )

    def __repr__(self) -> str:
        return f"<QuarantinedFiling id={self.id} ext_id={self.external_id!r}>"
