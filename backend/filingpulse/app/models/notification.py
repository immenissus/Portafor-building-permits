"""
app/models/notification.py
==========================
ORM model for the ``notifications`` table to buffer email alerts.
This prevents message loss if the external Resend API is unreachable.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base

if TYPE_CHECKING:
    from .subscriber import Subscriber
    from .filing import Filing


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    
    subscriber_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("subscribers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    filing_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("filings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Status can be 'pending', 'sent', 'failed'
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending", index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    subscriber: Mapped["Subscriber"] = relationship(
        "Subscriber",
        back_populates="notifications",
        lazy="select",
    )
    filing: Mapped["Filing"] = relationship(
        "Filing",
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<Notification id={self.id} status={self.status!r}>"
