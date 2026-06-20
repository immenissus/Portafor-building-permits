"""
app/services/matcher.py
=======================
Matching engine for FilingPulse.
Performs PostGIS spatial proximity and containment queries to match newly
ingested filings against subscriber territories and filters.
"""

from __future__ import annotations

import logging
from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.subscriber import Subscriber
from ..models.filing import Filing
from ..models.alert_sent import AlertSent

logger = logging.getLogger(__name__)


async def find_matches_for_filing(
    session: AsyncSession,
    filing: Filing,
) -> list[Subscriber]:
    """
    Find all active subscribers whose registered territories contain the geocoded
    point of the given filing, and whose filing type filters match.

    Filters out subscribers who have already received an alert for this filing
    (by checking the ``alerts_sent`` table).

    Parameters
    ----------
    session: AsyncSession
        The database session to query against.
    filing: Filing
        The Filing ORM instance to match against.

    Returns
    -------
    list[Subscriber]
        A list of matching Subscriber ORM instances.
    """
    # 1. Base statement selecting active subscribers
    stmt = (
        select(Subscriber)
        .where(Subscriber.alert_email_enabled == True)
    )

    # 2. Spatial filter: check if Subscriber's territory contains or intersects filing's point.
    # We construct the point geometry on-the-fly using longitude and latitude
    # to be 100% robust and independent of SQLAlchemy ORM flush/session states.
    filing_point = func.ST_SetSRID(func.ST_MakePoint(filing.longitude, filing.latitude), 4326)
    stmt = stmt.where(func.ST_Contains(Subscriber.territory, filing_point))

    # 3. Filing type filter: match if the subscriber's filter is empty,
    # or if the filing's type is in the subscriber's filter list.
    stmt = stmt.where(
        or_(
            func.cardinality(Subscriber.filing_type_filters) == 0,
            Subscriber.filing_type_filters.any(filing.filing_type),
        )
    )

    # 4. Deduplication: exclude subscribers who have already been alerted for this filing
    already_alerted_subquery = (
        select(1)
        .where(
            AlertSent.subscriber_id == Subscriber.id,
            AlertSent.filing_id == filing.id,
        )
        .exists()
    )
    stmt = stmt.where(~already_alerted_subquery)

    try:
        result = await session.execute(stmt)
        matched_subscribers = list(result.scalars().all())
        
        logger.info(
            "Filing [id=%d, type=%s] matched with %d subscriber(s).",
            filing.id,
            filing.filing_type,
            len(matched_subscribers),
        )
        return matched_subscribers

    except Exception as e:
        logger.error(
            "Error executing matching query for filing [id=%s]: %s",
            filing.id,
            str(e),
            exc_info=True,
        )
        return []
