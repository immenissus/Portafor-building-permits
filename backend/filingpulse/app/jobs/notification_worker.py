"""
app/jobs/notification_worker.py
===============================
Background worker to process and dispatch queued email notifications.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from ..database import get_session
from ..models.notification import Notification
from ..services.notifier import EmailNotifier

logger = logging.getLogger(__name__)


async def process_notification_queue() -> None:
    """
    Polls the 'notifications' table for pending alerts and attempts to send them
    via the EmailNotifier backend (SMTP or Resend). Updates status based on outcome.
    """
    logger.info("Starting notification worker batch...")
    notifier = EmailNotifier()

    async with get_session() as session:
        # 1. Fetch up to 50 pending notifications at a time to prevent memory bloat
        # We eager load the subscriber and filing relationships needed by the notifier.
        stmt = (
            select(Notification)
            .options(
                selectinload(Notification.subscriber),
                selectinload(Notification.filing),
            )
            .where(Notification.status == "pending")
            .order_by(Notification.created_at.asc())
            .limit(50)
        )
        result = await session.execute(stmt)
        pending_notifications = result.scalars().all()

        if not pending_notifications:
            return
            
        logger.info(f"Found {len(pending_notifications)} pending notifications to process.")

        for notification in pending_notifications:
            subscriber = notification.subscriber
            filing = notification.filing
            
            try:
                # 2. Dispatch via EmailNotifier
                await notifier.send_alert(subscriber, filing)
                
                # 3. Mark success
                notification.status = "sent"
                notification.sent_at = datetime.now(timezone.utc)
                notification.error_message = None
                
                logger.info(
                    f"Successfully dispatched notification [id={notification.id}] "
                    f"to subscriber [id={subscriber.id}] for filing [id={filing.id}]"
                )
            except Exception as e:
                # 4. Mark failure
                error_msg = str(e)
                notification.status = "failed"
                notification.error_message = error_msg
                
                logger.error(
                    f"Failed to dispatch notification [id={notification.id}] "
                    f"to subscriber [id={subscriber.id}]: {error_msg}"
                )
                
            # Commit the state of this individual notification before processing the next
            # so that crash/restart doesn't drop the successful ones.
            await session.commit()
