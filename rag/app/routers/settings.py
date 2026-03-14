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

from app.db import get_db_conn
from app.schemas.settings import SettingsRead, SettingsUpdate
from app.services import settings as svc

router = APIRouter(prefix="/settings", tags=["settings"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]


@router.get("", response_model=SettingsRead)
async def read_settings(session: DBSession):
    return await svc.get_effective_settings(session)


@router.put("", response_model=SettingsRead)
async def update_settings(patch: SettingsUpdate, session: DBSession):
    return await svc.apply_update(session, patch)
