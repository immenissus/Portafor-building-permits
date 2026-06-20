"""
app/jobs/scheduler.py
=====================
APScheduler-based polling engine.
Runs in-process alongside FastAPI. Periodically retrieves active jurisdictions,
runs their adapters to fetch new records, runs the ingestion pipeline, and
updates sync status/health metadata.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_session, get_session_factory
from ..models.jurisdiction import Jurisdiction
from ..models.filing import Filing
from ..adapters.socrata_adapter import SocrataAdapter
from ..schemas.raw_socrata import RawSocrataPermit
from ..services.geocoder import CensusGeocoder
from ..services.notifier import EmailNotifier
from ..services.ingestion import ingest_raw_record
from .notification_worker import process_notification_queue

logger = logging.getLogger(__name__)
settings = get_settings()

# Global scheduler instance
_scheduler: AsyncIOScheduler | None = None


async def run_notification_worker() -> None:
    """Wrapper to run the notification worker."""
    try:
        await process_notification_queue()
    except Exception as e:
        logger.error("Notification worker failed: %s", str(e), exc_info=True)


async def run_poll_job(jurisdiction_id: int) -> None:
    """
    Background job that polls a single jurisdiction's adapter, processes
    all retrieved records, and updates sync metrics.
    """
    logger.info("Starting background poll job for jurisdiction [id=%d]", jurisdiction_id)

    # Instantiate services to share across loop iterations
    geocoder = CensusGeocoder()
    notifier = EmailNotifier()

    # 1. Fetch the jurisdiction config
    async with get_session() as session:
        stmt = select(Jurisdiction).where(Jurisdiction.id == jurisdiction_id)
        result = await session.execute(stmt)
        jurisdiction = result.scalar_one_or_none()

        if not jurisdiction:
            logger.error("Failed to run poll: Jurisdiction [id=%d] not found.", jurisdiction_id)
            return

        if not jurisdiction.active:
            logger.info("Skipping poll: Jurisdiction %s [id=%d] is inactive.", jurisdiction.name, jurisdiction_id)
            return

        # Clone metadata needed for the poll
        name = jurisdiction.name
        source_type = jurisdiction.source_type
        config = jurisdiction.config
        last_watermark = jurisdiction.last_watermark

    # Determine watermark fallback (default to past 30 days)
    if last_watermark is None:
        watermark = datetime.now(timezone.utc) - timedelta(days=30)
    else:
        watermark = last_watermark

    # 2. Instantiate and run the adapter
    try:
        if source_type == "socrata":
            adapter = SocrataAdapter(jurisdiction_id, config)
        else:
            raise ValueError(f"Unsupported jurisdiction source_type: {source_type!r}")

        # Fetch raw records since the watermark
        raw_records = await session.run_sync(
            lambda sync_session: adapter.fetch_new_records(since=watermark, limit=100)
        )

        logger.info(
            "Adapter successfully retrieved %d records for %s [id=%d]",
            len(raw_records),
            name,
            jurisdiction_id,
        )

        # 3. Process records one-by-one in isolated, committed transactions
        # This guarantees that a single failure doesn't roll back successful records,
        # and quarantines are persisted immediately.
        success_count = 0
        quarantine_count = 0

        for record in raw_records:
            async with get_session() as isolated_session:
                # Re-fetch jurisdiction in the isolated session to attach it correctly
                stmt = select(Jurisdiction).where(Jurisdiction.id == jurisdiction_id)
                iso_juris_res = await isolated_session.execute(stmt)
                iso_jurisdiction = iso_juris_res.scalar_one()

                res = await ingest_raw_record(
                    session=isolated_session,
                    raw_record=record,
                    jurisdiction=iso_jurisdiction,
                    geocoder=geocoder,
                    notifier=notifier,
                )
                if isinstance(res, Filing):
                    success_count += 1
                else:
                    quarantine_count += 1

        # 4. Update sync watermarks and health on success
        async with get_session() as final_session:
            stmt = select(Jurisdiction).where(Jurisdiction.id == jurisdiction_id)
            final_res = await final_session.execute(stmt)
            final_jurisdiction = final_res.scalar_one()

            final_jurisdiction.last_polled_at = datetime.now(timezone.utc)
            final_jurisdiction.last_successful_poll_at = datetime.now(timezone.utc)
            final_jurisdiction.last_error = None
            final_jurisdiction.consecutive_error_count = 0

            # If we received records, advance the watermark to the highest date in the batch
            if raw_records:
                date_column = config.get("date_column")
                last_record_date_str = raw_records[-1].get(date_column)
                try:
                    new_watermark = RawSocrataPermit._parse_date(last_record_date_str)
                    final_jurisdiction.last_watermark = new_watermark
                    logger.info(
                        "Sync completed for %s. Watermark advanced to %s",
                        name,
                        new_watermark.isoformat(),
                    )
                except Exception as parse_err:
                    logger.error(
                        "Failed to parse new watermark date %r from date_column %r: %s",
                        last_record_date_str,
                        date_column,
                        str(parse_err),
                    )

            logger.info(
                "Sync summary for %s: Ingested=%d, Quarantined=%d",
                name,
                success_count,
                quarantine_count,
            )

    except Exception as e:
        logger.error("Poll job failed for %s [id=%d]: %s", name, jurisdiction_id, str(e), exc_info=True)
        # Update health to track errors
        async with get_session() as error_session:
            stmt = select(Jurisdiction).where(Jurisdiction.id == jurisdiction_id)
            err_res = await error_session.execute(stmt)
            err_jurisdiction = err_res.scalar_one()

            err_jurisdiction.last_polled_at = datetime.now(timezone.utc)
            err_jurisdiction.last_error = str(e)
            err_jurisdiction.consecutive_error_count += 1


async def schedule_active_jurisdictions() -> None:
    """Load all active jurisdictions from the database and queue their jobs."""
    global _scheduler
    if not _scheduler:
        return

    logger.info("Loading and scheduling active jurisdictions...")
    
    async with get_session() as session:
        stmt = select(Jurisdiction).where(Jurisdiction.active == True)
        result = await session.execute(stmt)
        active_jurisdictions = result.scalars().all()

        for j in active_jurisdictions:
            interval = j.config.get("poll_interval_seconds", settings.default_poll_interval_seconds)
            job_id = f"poll_jurisdiction_{j.id}"
            
            logger.info("Scheduling job %r for %r with interval %d seconds", job_id, j.name, interval)
            _scheduler.add_job(
                run_poll_job,
                trigger=IntervalTrigger(seconds=interval),
                args=[j.id],
                id=job_id,
                replace_existing=True,
            )


def start_scheduler() -> None:
    """Initialize and start the in-process background task scheduler."""
    global _scheduler
    if _scheduler is not None:
        logger.warning("Scheduler is already running.")
        return

    logger.info("Starting background scheduler...")
    _scheduler = AsyncIOScheduler(timezone=settings.scheduler_timezone)
    
    # Schedule the notification worker to process the queue every minute
    _scheduler.add_job(
        run_notification_worker,
        trigger=IntervalTrigger(seconds=60),
        id="process_notification_queue",
        replace_existing=True,
    )
    
    _scheduler.start()

    # Queue loading task to run immediately in the event loop
    asyncio.create_task(schedule_active_jurisdictions())


async def shutdown_scheduler() -> None:
    """Gracefully stop the background scheduler."""
    global _scheduler
    if _scheduler is None:
        return

    logger.info("Shutting down background scheduler...")
    _scheduler.shutdown(wait=True)
    _scheduler = None


def add_or_reschedule_job(jurisdiction_id: int, interval_seconds: int) -> None:
    """Helper to dynamically add or update a job when a new jurisdiction is added."""
    global _scheduler
    if not _scheduler:
        return

    job_id = f"poll_jurisdiction_{jurisdiction_id}"
    logger.info("Dynamic reschedule for %s: interval=%d seconds", job_id, interval_seconds)
    _scheduler.add_job(
        run_poll_job,
        trigger=IntervalTrigger(seconds=interval_seconds),
        args=[jurisdiction_id],
        id=job_id,
        replace_existing=True,
    )
