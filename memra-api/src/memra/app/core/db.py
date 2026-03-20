"""
Async Database Engine + Session Dependency
===========================================

Provides:
  - open_db_engine()  — creates async engine + session factory (called from lifespan)
  - get_db_conn()     — FastAPI dependency yielding an AsyncSession per request

Engine is stored on app.state; session factory on app.state.db_session_factory.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

from fastapi import Request
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)


def _make_async_url(url: str) -> str:
    """Rewrite postgresql:// → postgresql+asyncpg:// for the async driver."""
    return url.replace("postgresql://", "postgresql+asyncpg://", 1)


async def open_db_engine(
    database_url: str,
) -> tuple[AsyncEngine, async_sessionmaker[AsyncSession]]:
    """Create async engine and session factory. Call once from lifespan.

    Pool sizes are kept small to accommodate multi-process deployments
    (Gunicorn workers).  With 4 workers at pool_size=2, max_overflow=3,
    the worst-case total is 4 * 5 = 20 connections from the API + 5 from
    the background worker = 25 total — well within Supabase limits.

    pool_pre_ping=True: transparently reconnects if a connection goes stale.
    """
    connect_args = {}
    url = _make_async_url(database_url)

    # PgBouncer (transaction mode) is incompatible with asyncpg's prepared
    # statements.  Detect pooler URLs (port 6543 or ?pgbouncer=true) and
    # disable the statement cache.
    if ":6543" in database_url or "pgbouncer=true" in database_url:
        connect_args["statement_cache_size"] = 0

    engine = create_async_engine(
        url,
        pool_size=2,
        max_overflow=3,
        pool_pre_ping=True,
        connect_args=connect_args,
    )
    factory = async_sessionmaker(engine, expire_on_commit=False)
    return engine, factory


async def get_db_conn(request: Request) -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields an AsyncSession for the current request."""
    factory: async_sessionmaker[AsyncSession] | None = request.app.state.db_session_factory
    if factory is None:
        raise RuntimeError("Database is not configured (DATABASE_URL not set)")
    async with factory() as session:
        yield session
