"""
Platform Settings Router
=========================

GET  /settings              → all settings (secrets masked)
PUT  /settings/{key}        → update setting
GET  /settings/{key}/reveal → decrypted secret value (audit-logged)
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from memra.app.core.config import get_settings
from memra.app.core.db import get_db_conn
from memra.app.core.platform_auth import get_platform_admin
from memra.domain.services import audit
from memra.domain.services import platform_settings_service as pss

router = APIRouter(prefix="/settings", tags=["platform-admin-settings"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]
Admin = Annotated[dict, Depends(get_platform_admin)]


class UpdateSettingRequest(BaseModel):
    value: str


@router.get("")
async def list_settings(session: DBSession, admin: Admin):
    return await pss.get_all_masked(session)


@router.put("/{key}")
async def update_setting(
    key: str,
    body: UpdateSettingRequest,
    request: Request,
    session: DBSession,
    admin: Admin,
):
    settings = get_settings()
    try:
        await pss.set_value(
            session, key, body.value, settings.secret_key, admin_id=admin["sub"]
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    await audit.log_action(
        session,
        admin_id=admin["sub"],
        action="setting_update",
        target_type="platform_setting",
        target_id=key,
        ip_address=ip,
    )
    await session.commit()
    return {"status": "updated"}


@router.get("/{key}/reveal")
async def reveal_secret(
    key: str,
    request: Request,
    session: DBSession,
    admin: Admin,
):
    settings = get_settings()
    value = await pss.reveal_secret(session, key, settings.secret_key)
    if value is None:
        raise HTTPException(status_code=404, detail="Setting not found or empty")

    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    await audit.log_action(
        session,
        admin_id=admin["sub"],
        action="secret_reveal",
        target_type="platform_setting",
        target_id=key,
        ip_address=ip,
    )
    await session.commit()
    return {"key": key, "value": value}
