"""
app/models/__init__.py
======================
Exposes all SQLAlchemy models in a single module.
Required for Alembic to autogenerate tables correctly.
"""

from .base import Base, TimestampMixin
from .jurisdiction import Jurisdiction
from .subscriber import Subscriber
from .filing import Filing
from .quarantined_filing import QuarantinedFiling
from .alert_sent import AlertSent
from .address_cache import AddressCache
from .notification import Notification

__all__ = [
    "Base",
    "TimestampMixin",
    "Jurisdiction",
    "Subscriber",
    "Filing",
    "QuarantinedFiling",
    "AlertSent",
    "AddressCache",
    "Notification",
]
