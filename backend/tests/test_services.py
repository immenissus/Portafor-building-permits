"""
tests/test_services.py
======================
Unit tests for address parsing, geocoding, spatial matching, and notification services.
Uses mocks and the `responses` library to avoid external service calls.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import responses

# Ensure workspace root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from filingpulse.app.services.address_parser import parse_address
from filingpulse.app.services.geocoder import CensusGeocoder, GeocoderNoMatchError, GeocoderServiceError
from filingpulse.app.services.matcher import find_matches_for_filing
from filingpulse.app.services.notifier import EmailNotifier, NotifierError
from filingpulse.app.models.subscriber import Subscriber
from filingpulse.app.models.filing import Filing


# ---------------------------------------------------------------------------
# 1. Address Parser Tests
# ---------------------------------------------------------------------------


def test_parse_address_valid() -> None:
    """Ensure standard US addresses are parsed into structured components."""
    addr = "1600 Pennsylvania Ave NW, Washington, DC 20500"
    parsed = parse_address(addr)

    assert parsed.address_number == "1600"
    assert parsed.street_name == "Pennsylvania"
    assert parsed.street_name_post_type == "Ave"
    assert parsed.street_name_post_directional == "NW"
    assert parsed.city_name == "Washington"
    assert parsed.state_name == "DC"
    assert parsed.zip_code == "20500"
    assert parsed.is_geocodeable() is True
    assert "1600 Pennsylvania Ave NW Washington DC 20500" in parsed.to_one_line()


def test_parse_address_repeated_label_fallback() -> None:
    """Ensure extremely messy addresses with parsing loops fall back gracefully."""
    # This address would cause a repeated label or parse loop in usaddress
    messy_addr = "123 Main St Chicago IL 123 Main St Chicago IL"
    parsed = parse_address(messy_addr)

    # Parser should catch RepeatedLabelError and return an object with raw_input populated
    assert parsed.raw_input == messy_addr
    assert parsed.address_number is None


# ---------------------------------------------------------------------------
# 2. Census Geocoder Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@responses.activate
async def test_geocoder_success() -> None:
    """Ensure successful geocoding responses are parsed into standard coordinates."""
    geocoder = CensusGeocoder()
    test_addr = "1600 Pennsylvania Ave NW, Washington, DC"

    # Mock Census Bureau response
    mock_response_body = {
        "result": {
            "input": {"address": test_addr},
            "addressMatches": [
                {
                    "matchedAddress": "1600 PENNSYLVANIA AVE NW, WASHINGTON, DC, 20500",
                    "coordinates": {"x": -77.0365, "y": 38.8977},
                    "addressComponents": {
                        "city": "WASHINGTON",
                        "state": "DC",
                        "zip": "20500"
                    }
                }
            ]
        }
    }

    responses.add(
        responses.GET,
        geocoder.url,
        json=mock_response_body,
        status=200,
    )

    result = await geocoder.geocode(test_addr)
    assert result.latitude == 38.8977
    assert result.longitude == -77.0365
    assert result.matched_address == "1600 PENNSYLVANIA AVE NW, WASHINGTON, DC, 20500"


@pytest.mark.asyncio
@responses.activate
async def test_geocoder_no_match() -> None:
    """Ensure GeocoderNoMatchError is raised when the Census API finds nothing."""
    geocoder = CensusGeocoder()
    test_addr = "Invalid Address That Does Not Exist 99999"

    mock_response_body = {
        "result": {
            "addressMatches": []
        }
    }

    responses.add(
        responses.GET,
        geocoder.url,
        json=mock_response_body,
        status=200,
    )

    with pytest.raises(GeocoderNoMatchError):
        await geocoder.geocode(test_addr)


@pytest.mark.asyncio
@responses.activate
async def test_geocoder_out_of_bounds() -> None:
    """Ensure coordinates outside continental US / standard bounds are rejected."""
    geocoder = CensusGeocoder()
    test_addr = "Some Fake Place"

    # Mock response with (0,0) coordinates
    mock_response_body = {
        "result": {
            "addressMatches": [
                {
                    "matchedAddress": "0 Fake St",
                    "coordinates": {"x": 0.0, "y": 0.0},
                }
            ]
        }
    }

    responses.add(
        responses.GET,
        geocoder.url,
        json=mock_response_body,
        status=200,
    )

    with pytest.raises(ValueError, match="outside expected US bounds"):
        await geocoder.geocode(test_addr)


# ---------------------------------------------------------------------------
# 3. Spatial Matcher Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_matcher_executes_query() -> None:
    """Ensure find_matches_for_filing executes the correct SQLAlchemy and PostGIS query."""
    mock_session = AsyncMock()
    mock_execute_result = MagicMock()
    
    # Mocking subscribers returned from execute
    sub1 = Subscriber(id=1, email="sub1@local.com", api_key="key_1", business_name="Roofer", business_type="roofing")
    sub2 = Subscriber(id=2, email="sub2@local.com", api_key="key_2", business_name="HVAC", business_type="hvac")
    mock_execute_result.scalars().all.return_value = [sub1, sub2]
    mock_session.execute.return_value = mock_execute_result

    # Construct dummy filing
    filing = Filing(
        id=42,
        jurisdiction_id=1,
        external_id="perm-100",
        filing_type="roofing_permit",
        geom="SRID=4326;POINT(-97.7431 30.2672)",
        latitude=30.2672,
        longitude=-97.7431,
    )

    matches = await find_matches_for_filing(mock_session, filing)

    assert len(matches) == 2
    assert matches[0].email == "sub1@local.com"
    assert mock_session.execute.called is True


# ---------------------------------------------------------------------------
# 4. Email Notifier Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@patch("requests.post")
async def test_notifier_resend_backend(mock_post) -> None:
    """Ensure EmailNotifier sends JSON payload to Resend API correctly."""
    with patch("filingpulse.app.services.notifier.settings") as mock_settings:
        mock_settings.email_backend = "resend"
        mock_settings.resend_api_key = "re_test_key_12345"
        mock_settings.resend_api_url = "https://api.resend.com/emails"
        mock_settings.smtp_from_name = "FilingPulse"
        mock_settings.resend_from_address = "alerts@filingpulse.local"

        notifier = EmailNotifier()
        assert notifier.backend == "resend"

        # Setup subscriber & filing
        subscriber = Subscriber(
            id=10,
            email="contractor@test.com",
            api_key="key_resend_test",
            business_name="Austin Roofing Pros",
            business_type="roofing",
        )
        filing = Filing(
            id=100,
            filing_type="roofing_permit",
            address_raw="100 Main St, Austin, TX",
            filed_at=datetime(2026, 6, 18, tzinfo=timezone.utc),
            raw_payload={"description": "Replace composite roof shingles"},
        )

        # Mock API response success
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        # Execute
        await notifier.send_alert(subscriber, filing)

        # Verify POST was executed with proper headers and json
        mock_post.assert_called_once()
        args, kwargs = mock_post.call_args
        assert kwargs["headers"]["Authorization"] == "Bearer re_test_key_12345"
        assert "Austin Roofing Pros" in kwargs["json"]["text"]
        assert "Austin Roofing Pros" in kwargs["json"]["html"]
        assert kwargs["json"]["to"] == ["contractor@test.com"]
