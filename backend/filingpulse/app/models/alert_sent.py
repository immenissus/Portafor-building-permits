"""
app/models/alert_sent.py
========================
ORM model for the ``alerts_sent`` table, tracking which subscribers have
already been alerted about which filings to prevent duplicate notifications.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class AlertSent(Base):
    __tablename__ = "alerts_sent"

    subscriber_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("subscribers.id", ondelete="CASCADE"),
        primary_key=True,
    )
    filing_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("filings.id", ondelete="CASCADE"),
        primary_key=True,
    )

    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )

    # ------------------------------------------------------------------
    # Relationships
    # ------------------------------------------------------------------
    subscriber: Mapped["Subscriber"] = relationship(
        "Subscriber", back_populates="alerts_sent", lazy="select"
    )
    filing: Mapped["Filing"] = relationship(
        "Filing", back_populates="alerts_sent", lazy="select"
    )

    def __repr__(self) -> str:
        return f"<AlertSent sub_id={self.subscriber_id} filing_id={self.filing_id}>"
