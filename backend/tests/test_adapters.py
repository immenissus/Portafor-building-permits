"""
tests/test_adapters.py
======================
Unit tests for the SocrataAdapter.
Mocks the underlying `sodapy.Socrata` library API calls.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

# Ensure workspace root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from filingpulse.app.adapters.base import AdapterAuthError, AdapterRateLimitError, AdapterError
from filingpulse.app.adapters.socrata_adapter import SocrataAdapter, SocrataAdapterConfig


def test_socrata_adapter_config_validation() -> None:
    """Ensure SocrataAdapter validates input config schemas correctly."""
    config_data = {
        "source_type": "socrata",
        "domain": "data.austintexas.gov",
        "resource_id": "825e-id75",
        "date_column": "issued_date",
        "field_map": {"permit_num": "permit_number", "status_col": "status"},
        "dataset_type": "permit",
    }

    adapter = SocrataAdapter(jurisdiction_id=1, config=config_data)
    assert adapter.socrata_config.domain == "data.austintexas.gov"
    assert adapter.socrata_config.resource_id == "825e-id75"
    assert adapter.socrata_config.poll_interval_seconds == 86400  # Default


@patch("filingpulse.app.adapters.socrata_adapter.Socrata")
def test_socrata_fetch_success(mock_socrata_class) -> None:
    """Ensure fetch_new_records calls Socrata.get with correct SoQL filters."""
    # Set up mock Socrata instance
    mock_socrata_instance = MagicMock()
    mock_socrata_class.return_value = mock_socrata_instance
    
    # Configure mock return value for .get
    mock_records = [
        {"permit_num": "EP-100", "issued_date": "2026-06-18T10:00:00", "address": "123 Main St"},
        {"permit_num": "EP-101", "issued_date": "2026-06-18T11:00:00", "address": "456 Oak St"},
    ]
    mock_socrata_instance.get.return_value = mock_records

    config_data = {
        "source_type": "socrata",
        "domain": "data.austintexas.gov",
        "resource_id": "825e-id75",
        "date_column": "issued_date",
        "field_map": {"permit_num": "permit_number"},
        "dataset_type": "permit",
    }
    adapter = SocrataAdapter(jurisdiction_id=1, config=config_data)

    # Perform fetch
    watermark = datetime(2026, 6, 17, 0, 0, 0)
    results = adapter.fetch_new_records(since=watermark, limit=10)

    # Assertions
    assert len(results) == 2
    assert results[0]["permit_num"] == "EP-100"

    # Verify underlying get was called with correct parameters
    mock_socrata_instance.get.assert_called_once_with(
        "825e-id75",
        where="issued_date > '2026-06-17T00:00:00'",
        order="issued_date ASC",
        limit=10,
    )
