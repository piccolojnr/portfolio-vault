"""
FastAPI Dependency Providers
=============================

Centralises all Depends() helpers so routers stay lean.
"""

from fastapi import Depends
from app.config import Settings, get_settings
from portfolio_vault.database import get_qdrant_client


def get_client(settings: Settings = Depends(get_settings)):
    """Return a Qdrant client using injected settings."""
    return get_qdrant_client(settings)
