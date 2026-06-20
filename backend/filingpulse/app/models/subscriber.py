"""
app/models/subscriber.py
========================
ORM model for the ``subscribers`` table using GeoAlchemy2 for PostGIS.
"""

from __future__ import annotations

from sqlalchemy import BigInteger, Boolean, String
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geometry

from .base import Base, TimestampMixin


class Subscriber(Base, TimestampMixin):
    __tablename__ = "subscribers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    api_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    business_name: Mapped[str] = mapped_column(String(255), nullable=False)
    business_type: Mapped[str] = mapped_column(String(100), nullable=False)

    # PostGIS geometry column for territory (Polygon or MultiPolygon)
    # SRID 4326 is standard GPS coordinates (WGS-84)
    territory = mapped_column(
        Geometry(geometry_type="GEOMETRY", srid=4326, spatial_index=True),
        nullable=False,
    )

    # List of FilingType values to filter on (empty means all types)
    filing_type_filters: Mapped[list[str]] = mapped_column(
        ARRAY(String),
        nullable=False,
        default=list,
    )

    alert_email_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    # ------------------------------------------------------------------
    # Relationships
    # ------------------------------------------------------------------
    alerts_sent: Mapped[list["AlertSent"]] = relationship(  # noqa: F821
        "AlertSent",
        back_populates="subscriber",
        cascade="all, delete-orphan",
        lazy="select",
    )
    notifications: Mapped[list["Notification"]] = relationship(  # noqa: F821
        "Notification",
        back_populates="subscriber",
        cascade="all, delete-orphan",
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<Subscriber id={self.id} email={self.email!r}>"
