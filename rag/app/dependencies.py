"""
FastAPI Dependency Providers
=============================

Centralises all Depends() helpers so routers stay lean.
"""

from fastapi import Depends
from app.config import Settings, get_settings
from app.db import get_db_conn
from core.database import get_qdrant_client

__all__ = ["get_client", "get_db_conn"]


def get_client(settings: Settings = Depends(get_settings)):
    """Return a Qdrant client using injected settings."""
    return get_qdrant_client(settings)
