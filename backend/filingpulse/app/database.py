"""
app/database.py
===============
Async SQLAlchemy 2.0 engine + session factory.

Usage in FastAPI route (via dependency injection):
    async with get_session() as session:
        ...

Usage in scheduler jobs (direct):
    async with AsyncSession(engine) as session:
        ...
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from .config import get_settings

settings = get_settings()

# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------
# NullPool is used in tests to avoid connection-pool issues with pytest-asyncio.
# In production the default AsyncAdaptedQueuePool is used.
# Switch to NullPool by setting TESTING=true env var or passing it directly.

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def _build_engine(*, testing: bool = False) -> AsyncEngine:
    kwargs: dict = dict(
        echo=settings.debug,
        future=True,
    )
    if testing:
        kwargs["poolclass"] = NullPool
    else:
        kwargs["pool_size"] = settings.db_pool_size
        kwargs["max_overflow"] = settings.db_max_overflow
        kwargs["pool_timeout"] = settings.db_pool_timeout
        kwargs["pool_pre_ping"] = True

    return create_async_engine(str(settings.database_url), **kwargs)


def get_engine(*, testing: bool = False) -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = _build_engine(testing=testing)
    return _engine


def get_session_factory(*, testing: bool = False) -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            bind=get_engine(testing=testing),
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
            autocommit=False,
        )
    return _session_factory


@asynccontextmanager
async def get_session(
    *, testing: bool = False
) -> AsyncGenerator[AsyncSession, None]:
    """
    Async context manager that yields a session and commits on success,
    rolls back on exception, and always closes the session.

    Use this in scheduler jobs.  In API routes, use the ``db`` FastAPI
    dependency defined in ``app/api/deps.py`` instead.
    """
    factory = get_session_factory(testing=testing)
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def dispose_engine() -> None:
    """Gracefully close the connection pool. Called in app lifespan shutdown."""
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _session_factory = None
