"""
app/api/deps.py
===============
Common dependencies injected into FastAPI path operations (e.g. database session).
"""

from __future__ import annotations

from typing import AsyncGenerator
from fastapi import Header, HTTPException, status, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_session
from ..models.subscriber import Subscriber

settings = get_settings()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that yields an async database session for the duration
    of a request, automatically committing or rolling back.
    """
    async with get_session() as session:
        yield session


async def verify_admin_api_key(
    x_admin_key: str = Header(..., alias="X-Admin-Key"),
) -> str:
    """
    Dependency that enforces a simple token-based authentication header
    for administrative endpoints.
    """
    if x_admin_key != settings.admin_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Admin-Key header.",
        )
    return x_admin_key


async def verify_subscriber_api_key(
    subscriber_id: int,
    x_subscriber_key: str = Header(..., alias="X-Subscriber-Key"),
    db: AsyncSession = Depends(get_db),
) -> Subscriber:
    """
    Dependency that validates if X-Subscriber-Key matches the API key of the
    requested subscriber_id. Returns the Subscriber model if successful.
    """
    stmt = select(Subscriber).where(Subscriber.id == subscriber_id)
    result = await db.execute(stmt)
    subscriber = result.scalar_one_or_none()

    if not subscriber:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscriber not found.",
        )

    if subscriber.api_key != x_subscriber_key.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Subscriber-Key header.",
        )

    return subscriber
