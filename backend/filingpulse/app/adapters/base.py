"""
app/adapters/base.py
====================
Abstract base class every jurisdiction adapter must implement.

Rules:
- `fetch_new_records` MUST return raw dicts straight from the source — no
  transformation, no field invention.  Parsing happens in the calling service.
- The adapter MUST NOT persist anything to the database.  Persistence is the
  responsibility of the polling job (app/jobs/scheduler.py).
- Raise `AdapterError` (or a subclass) for retriable transport failures.
  Validation failures are NOT raised here — they surface when the caller
  passes the raw dict to a Pydantic model.
"""

from __future__ import annotations

import abc
import logging
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Config model
# ---------------------------------------------------------------------------

class AdapterConfig(BaseModel):
    """
    Per-jurisdiction configuration stored in jurisdictions.config (JSONB).

    Every adapter subclass may extend this with its own fields by declaring
    a nested Pydantic model and validating ``raw_config`` against it inside
    ``__init__``.
    """

    model_config = ConfigDict(extra="allow")  # subclasses add their own keys

    source_type: str = Field(
        ...,
        description="Discriminator: 'socrata' | 'manual' | …",
    )
    poll_interval_seconds: int = Field(
        default=86_400,  # 24 h — most open-data portals update once/day
        ge=60,
        description="How often the scheduler invokes this adapter.",
    )
    # Optional display name used in logs / health endpoint
    display_name: str | None = None


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class AdapterError(Exception):
    """Base class for retriable adapter-level transport/HTTP errors."""


class AdapterAuthError(AdapterError):
    """Raised when the remote API rejects our credentials."""


class AdapterRateLimitError(AdapterError):
    """Raised on HTTP 429; the scheduler will back off before retrying."""


# ---------------------------------------------------------------------------
# Abstract base
# ---------------------------------------------------------------------------

class JurisdictionAdapter(abc.ABC):
    """
    Abstract base class for all jurisdiction data-source adapters.

    Subclassing contract
    --------------------
    1. Call ``super().__init__(jurisdiction_id, config)`` from ``__init__``.
    2. Implement ``fetch_new_records``.
    3. Do NOT geocode, parse, validate, or persist inside this class.
    4. If your source lacks a verified endpoint/resource_id, raise
       ``NotImplementedError`` with an explicit message rather than guessing.

    Example
    -------
    ::

        class MyAdapter(JurisdictionAdapter):
            SOURCE_TYPE = "my_source"

            def __init__(self, jurisdiction_id: int, config: AdapterConfig):
                super().__init__(jurisdiction_id, config)
                # validate source-specific config keys here

            def fetch_new_records(
                self,
                since: datetime,
                *,
                limit: int = 1000,
            ) -> list[dict[str, Any]]:
                ...
    """

    #: Subclasses MUST set this to match AdapterConfig.source_type
    SOURCE_TYPE: str = ""

    def __init__(self, jurisdiction_id: int, config: AdapterConfig) -> None:
        self.jurisdiction_id = jurisdiction_id
        self.config = config
        self._log = logging.getLogger(
            f"{__name__}.{self.__class__.__name__}[jid={jurisdiction_id}]"
        )

    # ------------------------------------------------------------------
    # Abstract interface
    # ------------------------------------------------------------------

    @abc.abstractmethod
    def fetch_new_records(
        self,
        since: datetime,
        *,
        limit: int = 1000,
    ) -> list[dict[str, Any]]:
        """
        Fetch raw records from the source that are *newer* than ``since``.

        Parameters
        ----------
        since:
            Watermark datetime from the last successful poll.  Adapters MUST
            use this rather than "last 24 h" so that the scheduler can recover
            from gaps without missing or double-counting records.
        limit:
            Maximum records to return in a single call.  Callers may invoke
            this method multiple times with pagination if needed, but the
            scheduler currently fetches at most ``limit`` records per run to
            stay within memory constraints.  Increase ``limit`` or add
            cursor-based pagination in a future phase.

        Returns
        -------
        list[dict[str, Any]]
            Raw records exactly as returned by the source — no field mapping,
            no type coercion.  The caller is responsible for Pydantic
            validation.

        Raises
        ------
        AdapterError
            For retriable transport / HTTP errors (5xx, timeouts, …).
        AdapterAuthError
            For 401/403 responses.
        AdapterRateLimitError
            For 429 responses.
        NotImplementedError
            If the adapter has not been configured with a verified endpoint.
            This is intentional — see anti-hallucination rules in the spec.
        """

    # ------------------------------------------------------------------
    # Optional hooks (adapters may override)
    # ------------------------------------------------------------------

    def health_check(self) -> dict[str, Any]:
        """
        Return a dict with at minimum ``{"status": "ok" | "error"}``.
        Override in adapters that can do a lightweight liveness ping.
        """
        return {"status": "ok", "source_type": self.SOURCE_TYPE}

    # ------------------------------------------------------------------
    # Helpers available to subclasses
    # ------------------------------------------------------------------

    def _log_fetch(self, since: datetime, count: int) -> None:
        self._log.info(
            "Fetched %d record(s) since %s",
            count,
            since.isoformat(),
        )
