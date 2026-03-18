"""
Settings Router
===============

GET  /settings — read current effective settings (keys masked)
PUT  /settings — update settings in DB

Prefix: /settings (mounted under /api/v1)
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from portfolio_rag.app.core.db import get_db_conn
from portfolio_rag.app.core.dependencies import require_role
from portfolio_rag.domain.models.settings import RuntimeConfig, SettingsRead, SettingsUpdate
from portfolio_rag.domain.services import settings as svc

router = APIRouter(prefix="/settings", tags=["settings"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]
AdminUser = Annotated[dict, Depends(require_role("owner", "admin"))]


@router.get("", response_model=SettingsRead)
async def read_settings(session: DBSession, current_user: AdminUser):
    return await svc.get_effective_settings(session)


@router.put("", response_model=SettingsRead)
async def update_settings(patch: SettingsUpdate, session: DBSession, current_user: AdminUser):
    return await svc.apply_update(session, patch)


@router.get("/runtime", response_model=RuntimeConfig)
async def runtime_config(session: DBSession, current_user: AdminUser):
    """Server-to-server only: returns decrypted API keys + effective config."""
    return await svc.get_runtime_config(session)
