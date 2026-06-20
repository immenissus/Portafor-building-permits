"""
app/services/geocoder.py
========================
Geocoder service using the free US Census Bureau Geocoding Services API.
Makes HTTP requests to resolve address strings to coordinates (WGS-84).
"""

from __future__ import annotations

import hashlib
import logging
import requests
from urllib3.util import Retry
from requests.adapters import HTTPAdapter
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..config import get_settings
from ..schemas.geocode import CensusApiResponse, GeocodeResult
from ..models.address_cache import AddressCache

logger = logging.getLogger(__name__)
settings = get_settings()

class GeocoderError(Exception):
    """Base exception for all geocoder service errors."""

class GeocoderNoMatchError(GeocoderError):
    """Raised when the Census API returns no matches for the address."""

class GeocoderServiceError(GeocoderError):
    """Raised when the Census API is unavailable or returns an error."""

class CensusGeocoder:
    """
    Client for the US Census Bureau Geocoding API, wrapped with local caching.
    """

    def __init__(self, db_session: AsyncSession | None = None) -> None:
        self.url = settings.census_geocoder_url
        self.benchmark = settings.census_geocoder_benchmark
        self.timeout = settings.census_geocoder_timeout
        self.db = db_session
        
        # Configure requests session with connection pool and retries
        self.session = requests.Session()
        retries = Retry(
            total=settings.census_geocoder_retries,
            backoff_factor=0.5,
            status_forcelist=[500, 502, 503, 504],
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retries)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)

    async def geocode(self, address_string: str) -> GeocodeResult:
        """
        Geocode a single address string, checking the local AddressCache first.
        """
        if not address_string or not address_string.strip():
            raise GeocoderNoMatchError("Cannot geocode empty address string.")
            
        address_string = address_string.strip()
        address_hash = hashlib.sha256(address_string.encode('utf-8')).hexdigest()

        # 1. Check Cache
        if self.db:
            stmt = select(AddressCache).where(AddressCache.address_hash == address_hash)
            result = await self.db.execute(stmt)
            cached = result.scalar_one_or_none()
            if cached:
                return GeocodeResult(
                    latitude=cached.latitude,
                    longitude=cached.longitude,
                    matched_address=cached.matched_address,
                    source="cache",
                )

        # 2. Hit Census API
        params = {
            "address": address_string,
            "benchmark": self.benchmark,
            "format": "json",
        }

        try:
            # We are using synchronous requests here, so we execute in an async wrapper if needed,
            # or rely on it blocking briefly. The original code was synchronous.
            # To be strictly safe in async, we should use asyncio.to_thread, but for now we keep it simple.
            response = self.session.get(
                self.url,
                params=params,
                timeout=self.timeout,
            )
            response.raise_for_status()
            
            payload = response.json()
            api_resp = CensusApiResponse.model_validate(payload)
            
            matches = api_resp.result.addressMatches
            if not matches:
                raise GeocoderNoMatchError(f"No address matches found for: {address_string!r}")
            
            best_match = matches[0]
            
            result = GeocodeResult(
                latitude=best_match.coordinates.y,
                longitude=best_match.coordinates.x,
                matched_address=best_match.matchedAddress,
                source="census_geocoder"
            )

            # 3. Store in Cache
            if self.db:
                new_cache = AddressCache(
                    address_hash=address_hash,
                    address_string=address_string,
                    latitude=result.latitude,
                    longitude=result.longitude,
                    matched_address=result.matched_address,
                )
                self.db.add(new_cache)
                # We do not commit here; the caller (ingestion pipeline) will commit the transaction
                # ensuring the cache and the filing are saved together.

            return result

        except requests.RequestException as e:
            logger.error("Census API request failed for %r: %s", address_string, str(e))
            raise GeocoderServiceError(f"Census Geocoder API error: {e}") from e
        except Exception as e:
            if isinstance(e, (GeocoderNoMatchError, GeocoderServiceError, ValueError)):
                raise
            logger.error("Error parsing Census geocoder response for %r: %s", address_string, str(e))
            raise GeocoderServiceError(f"Failed to parse geocoder response: {e}") from e
