import asyncio
from logging.config import fileConfig
import os
import sys

from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# 1. Ensure the workspace root is on the path so we can import filingpulse modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from filingpulse.app.config import get_settings
from filingpulse.app.models import Base

settings = get_settings()

# 2. Setup config & logging
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 3. Setup metadata for autogenerate
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (schema scripting without DB connection)."""
    url = str(settings.database_url)
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    """Sync transaction hook inside the DB connection context."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        # GeoAlchemy2 support for autogenerating PostGIS spatial columns
        include_object=None,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Run migrations in 'online' mode (live DB connection)."""
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = str(settings.database_url)

    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    # Run the online migration within the asyncio event loop
    try:
        # Check if an event loop is already running (e.g. inside tests)
        loop = asyncio.get_running_loop()
        loop.create_task(run_migrations_online())
    except RuntimeError:
        asyncio.run(run_migrations_online())
