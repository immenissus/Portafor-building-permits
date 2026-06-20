"""
app/services/address_parser.py
==============================
Wrapper service for the ``usaddress`` library.
Parses unstructured US address strings into structured parts.
"""

from __future__ import annotations

import logging
import usaddress

from ..schemas.address import ParsedAddress

logger = logging.getLogger(__name__)


class AddressParserError(Exception):
    """Raised when address parsing fails catastrophically."""


def parse_address(address_string: str) -> ParsedAddress:
    """
    Parse a messy, unstructured US address string into a structured ParsedAddress schema.

    Uses ``usaddress.tag()`` under the hood, which is a probabilistic parser
    trained on US addresses.  Catches RepeatedLabelError and other parsing failures
    gracefully to avoid crashing the ingestion pipeline, returning an incomplete
    but structured object instead.

    Parameters
    ----------
    address_string: str
        The raw unstructured address string from the source.

    Returns
    -------
    ParsedAddress
        A validated Pydantic model containing the parsed fields.
    """
    if not address_string or not address_string.strip():
        return ParsedAddress(raw_input=address_string)

    cleaned_address = address_string.strip()

    try:
        # usaddress.tag returns: (OrderedDict, address_type)
        # e.g., ({'AddressNumber': '123', 'StreetName': 'Main'}, 'Street Address')
        tagged_dict, address_type = usaddress.tag(cleaned_address)
        
        # Build ParsedAddress using the tagged dictionary keys mapping to aliases
        parsed = ParsedAddress(
            address_type=address_type,
            raw_input=cleaned_address,
            **tagged_dict
        )
        return parsed

    except usaddress.RepeatedLabelError as e:
        # RepeatedLabelError occurs when a label (e.g. StreetName) appears multiple times
        # and usaddress cannot resolve the ambiguity. This is common in messy inputs.
        logger.warning(
            "usaddress.RepeatedLabelError parsing address %r: %s",
            cleaned_address,
            str(e),
        )
        # Fallback: return empty object with raw_input populated so downstream geocoder
        # can still try to resolve it directly.
        return ParsedAddress(raw_input=cleaned_address)
    except Exception as e:
        logger.error(
            "Unexpected error in AddressParser for address %r: %s",
            cleaned_address,
            str(e),
            exc_info=True,
        )
        return ParsedAddress(raw_input=cleaned_address)
