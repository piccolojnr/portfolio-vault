"""
Platform Settings Router
=========================

GET  /settings              → all settings (secrets masked)
PUT  /settings/{key}        → update setting
GET  /settings/{key}/reveal → decrypted secret value (audit-logged)
"""

from __future__ import annotations

from typing import Annotated
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from memra.app.core.config import Settings, get_settings
from memra.app.core.db import get_db_conn
from memra.app.core.platform_auth import get_platform_admin
from memra.domain.services import audit
from memra.domain.services import platform_settings_service as pss
from memra.domain.services.paystack_service import PaystackService

router = APIRouter(prefix="/settings", tags=["platform-admin-settings"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]
Admin = Annotated[dict, Depends(get_platform_admin)]


class UpdateSettingRequest(BaseModel):
    value: str


async def paystack_config_diagnostics(
    *,
    session: AsyncSession | None,
    settings: Settings,
) -> dict[str, Any]:
    """Best-effort Paystack configuration diagnostics for /health.

    This is intentionally configuration-only (no external Paystack calls)
    so health checks remain fast and deterministic.
    """

    def _key_mode(secret: str | None) -> str | None:
        if not secret:
            return None
        if secret.startswith("sk_test"):
            return "test"
        if secret.startswith("sk_live"):
            return "live"
        return None

    diagnostics: dict[str, Any] = {
        "status": "not_configured",
        "key_mode": None,
        "checks": {
            "secret_key_present": False,
            "public_key_present": False,
            "pro_plan_code_present": False,
            "enterprise_plan_code_present": False,
            "key_mode_match": None,
        },
    }

    try:
        if session is not None:
            secret_key = await pss.get_value(
                session,
                "paystack_secret_key",
                settings.secret_key,
                fallback_settings=settings,
            )
            public_key = await pss.get_value(
                session,
                "paystack_public_key",
                settings.secret_key,
                fallback_settings=settings,
            )
            pro_plan_code = await pss.get_value(
                session,
                "paystack_pro_plan_code",
                settings.secret_key,
                fallback_settings=settings,
            )
            enterprise_plan_code = await pss.get_value(
                session,
                "paystack_enterprise_plan_code",
                settings.secret_key,
                fallback_settings=settings,
            )
        else:
            secret_key = settings.paystack_secret_key
            public_key = settings.paystack_public_key
            pro_plan_code = settings.paystack_pro_plan_code
            enterprise_plan_code = settings.paystack_enterprise_plan_code
    except Exception as e:
        diagnostics["status"] = str(e)
        return diagnostics

    diagnostics["key_mode"] = _key_mode(secret_key)
    diagnostics["checks"]["secret_key_present"] = bool(secret_key)
    diagnostics["checks"]["public_key_present"] = bool(public_key)
    diagnostics["checks"]["pro_plan_code_present"] = bool(pro_plan_code)
    diagnostics["checks"]["enterprise_plan_code_present"] = bool(enterprise_plan_code)

    if not secret_key:
        return diagnostics

    key_mode_match: bool | None = None
    if public_key:
        key_mode_match = (
            (secret_key.startswith("sk_test") and public_key.startswith("pk_test"))
            or (secret_key.startswith("sk_live") and public_key.startswith("pk_live"))
        )
    diagnostics["checks"]["key_mode_match"] = key_mode_match

    if (
        diagnostics["checks"]["secret_key_present"]
        and diagnostics["checks"]["public_key_present"]
        and diagnostics["checks"]["pro_plan_code_present"]
        and diagnostics["checks"]["enterprise_plan_code_present"]
        and key_mode_match is not False
    ):
        diagnostics["status"] = "ok" if key_mode_match is not False else "misconfigured"

    if diagnostics["status"] == "not_configured" and public_key and pro_plan_code and enterprise_plan_code:
        # Secret key exists but plan/public keys were missing earlier; preserve "not_configured".
        diagnostics["status"] = "not_configured"

    return diagnostics


@router.get("")
async def list_settings(session: DBSession, _admin: Admin):
    settings = get_settings()
    return await pss.get_all_masked(session, fallback_settings=settings)


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
        raise HTTPException(status_code=404, detail=str(exc)) from exc

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
    value = await pss.reveal_secret(
        session, key, settings.secret_key, fallback_settings=settings
    )
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


@router.get("/paystack/preflight")
async def paystack_preflight(
    session: DBSession,
    _admin: Admin,
):
    settings = get_settings()
    svc = PaystackService(session=session, settings=settings)
    result = await svc.preflight_check()
    return result
