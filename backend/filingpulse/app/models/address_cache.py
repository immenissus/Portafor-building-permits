"""
app/models/address_cache.py
===========================
ORM model for the ``address_cache`` table to drastically reduce external Census API calls.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import BigInteger, DateTime, Float, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class AddressCache(Base):
    __tablename__ = "address_cache"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    
    # We will use SHA-256 to hash the cleaned "to_one_line()" address.
    address_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    
    # Store the exact string that was hashed for visibility/debugging
    address_string: Mapped[str] = mapped_column(Text, nullable=False)

    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    matched_address: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<AddressCache id={self.id} hash={self.address_hash[:8]}...>"
