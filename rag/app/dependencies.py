"""
FastAPI Dependency Providers
=============================

Centralises all Depends() helpers so routers stay lean.
"""

from fastapi import Depends, Request
from app.config import Settings, get_settings
from app.db import get_db_conn
from core.database import get_qdrant_client

__all__ = ["get_client", "get_db_conn", "get_live_settings"]


def get_client(settings: Settings = Depends(get_settings)):
    """Return a Qdrant client using injected settings."""
    return get_qdrant_client(settings)


async def get_live_settings(request: Request) -> Settings:
    """
    Return Settings with DB overrides applied.

    Reads the `settings` table and overlays any configured values on top of
    the base env-file settings. Falls back gracefully to env settings if the
    DB is unavailable.
    """
    from app.services import settings_db

    base = get_settings()
    factory = request.app.state.db_session_factory
    if factory is None:
        return base
    try:
        async with factory() as session:
            overrides = await settings_db.load_overrides(session, base.secret_key)
        if overrides:
            return base.model_copy(update=overrides)
    except Exception:
        pass  # DB read failed — fall through to env settings
    return base
