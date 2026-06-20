"""
app/adapters/socrata_adapter.py
===============================
Socrata API adapter implementation using the ``sodapy`` library.
Fetches records from Socrata open-data portals using SoQL queries.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

import requests
from sodapy import Socrata

from .base import (
    AdapterConfig,
    AdapterError,
    AdapterAuthError,
    AdapterRateLimitError,
    JurisdictionAdapter,
)

logger = logging.getLogger(__name__)


class SocrataAdapterConfig(AdapterConfig):
    """Specific configuration required for Socrata datasets."""
    domain: str
    resource_id: str
    app_token: str | None = None
    date_column: str
    field_map: dict[str, str]
    dataset_type: str  # 'permit' | 'license'


class SocrataAdapter(JurisdictionAdapter):
    """
    Adapter for Socrata-powered open data portals (SODA API).
    """

    SOURCE_TYPE = "socrata"

    def __init__(self, jurisdiction_id: int, config: dict[str, Any] | AdapterConfig) -> None:
        # If passed a dict, parse it into SocrataAdapterConfig first
        if isinstance(config, dict):
            config = SocrataAdapterConfig.model_validate(config)
        elif not isinstance(config, SocrataAdapterConfig):
            # Safe parsing
            config = SocrataAdapterConfig.model_validate(config.model_dump())

        super().__init__(jurisdiction_id, config)
        self.socrata_config: SocrataAdapterConfig = config

    def fetch_new_records(
        self,
        since: datetime,
        *,
        limit: int = 1000,
    ) -> list[dict[str, Any]]:
        """
        Fetch raw records from the Socrata dataset that have been updated
        or filed after the ``since`` watermark.

        Uses SoQL (Socrata Query Language) to query the SODA API.
        """
        domain = self.socrata_config.domain
        resource_id = self.socrata_config.resource_id
        app_token = self.socrata_config.app_token
        date_column = self.socrata_config.date_column

        # Initialize the sodapy Socrata client
        # timeout is set to 30s by default
        client = Socrata(domain, app_token, timeout=30)

        # Socrata date filtering expects ISO-8601 strings.
        # Format the datetime since watermark.
        since_str = since.strftime("%Y-%m-%dT%H:%M:%S")

        # Build the SoQL WHERE clause
        where_clause = f"{date_column} > '{since_str}'"
        order_clause = f"{date_column} ASC"

        self._log.info(
            "Querying Socrata dataset [domain=%s, id=%s] where %s ordering by %s (limit=%d)",
            domain,
            resource_id,
            where_clause,
            order_clause,
            limit,
        )

        try:
            # sodapy client.get returns a list of dictionaries
            # We close the client using a context manager or just close it after call
            with client:
                results = client.get(
                    resource_id,
                    where=where_clause,
                    order=order_clause,
                    limit=limit,
                )
            
            if not isinstance(results, list):
                # Safeguard against unparseable payloads
                raise AdapterError(f"Unexpected Socrata response shape: {type(results)}")

            self._log_fetch(since, len(results))
            return results

        except requests.exceptions.HTTPError as e:
            status_code = e.response.status_code if e.response is not None else None
            msg = f"Socrata HTTP error {status_code}: {e}"
            self._log.error(msg, exc_info=True)

            if status_code in (401, 403):
                raise AdapterAuthError(msg) from e
            elif status_code == 429:
                raise AdapterRateLimitError(msg) from e
            else:
                raise AdapterError(msg) from e

        except requests.exceptions.RequestException as e:
            msg = f"Socrata connection/network error: {e}"
            self._log.error(msg, exc_info=True)
            raise AdapterError(msg) from e

        except Exception as e:
            msg = f"Unexpected Socrata adapter error: {e}"
            self._log.error(msg, exc_info=True)
            raise AdapterError(msg) from e
