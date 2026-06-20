"""
app/main.py
===========
The entrypoint of the FilingPulse FastAPI application.
Handles lifecycle events (starting background scheduler, closing db connection pools)
and registers API routers.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import dispose_engine
from .jobs.scheduler import start_scheduler, shutdown_scheduler
from .api import subscribers, jurisdictions, filings

logger = logging.getLogger("app")
settings = get_settings()

# Setup logging configuration
logging.basicConfig(
    level=logging.INFO if not settings.debug else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Handles application startup and shutdown lifecycle hooks.
    """
    logger.info("Initializing FilingPulse server lifespan...")
    
    # 1. Start the in-process background scheduler
    start_scheduler()

    yield

    logger.info("Deinitializing FilingPulse server lifespan...")
    
    # 2. Shutdown background scheduler
    await shutdown_scheduler()
    
    # 3. Gracefully dispose of SQLAlchemy engine connection pool
    await dispose_engine()


# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    description="Monitor government open data feeds and send targeted service area lead alerts.",
    version="1.0.0",
    lifespan=lifespan,
    debug=settings.debug,
)

# Enable CORS for standard web clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Routers
app.include_router(subscribers.router)
app.include_router(jurisdictions.router)
app.include_router(filings.router)


@app.get("/health", tags=["system"], summary="Check system liveness status")
async def health_check() -> dict[str, str]:
    """Simple status route to check if the API is running."""
    return {"status": "healthy", "service": settings.app_name}
