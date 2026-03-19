"""
FastAPI Dependency Providers
=============================

Centralises all Depends() helpers so routers stay lean.
"""

from fastapi import Depends, HTTPException, Request
from memra.app.core.config import Settings, get_settings
from memra.app.core.db import get_db_conn
from memra.infrastructure.vector.qdrant import get_qdrant_client

__all__ = ["get_client", "get_db_conn", "get_live_settings", "get_current_user", "require_role"]


def get_client(settings: Settings = Depends(get_settings)):
    """Return a Qdrant client using injected settings."""
    return get_qdrant_client(settings)


async def get_live_settings(request: Request) -> Settings:
    """
    Return Settings with DB overrides applied.

    Priority: platform_settings (cached) > org-level settings table > env vars.
    Falls back gracefully to env settings if the DB is unavailable.
    """
    from memra.domain.services import settings_db
    from memra.domain.services import platform_settings_service

    base = get_settings()
    factory = request.app.state.db_session_factory
    if factory is None:
        return base
    try:
        async with factory() as session:
            # Layer 1: platform_settings overrides (cached, 5-min TTL)
            platform_overrides = await platform_settings_service.build_settings_overrides(
                session, base.secret_key
            )
            # Layer 2: org-level settings overrides
            org_overrides = await settings_db.load_overrides(session, base.secret_key)
            # Merge: platform first, then org on top (org can override platform)
            combined = {**platform_overrides, **org_overrides} if org_overrides else platform_overrides
            result = base.model_copy(update=combined) if combined else base
            # Overlay org-level system_prompt
            try:
                from memra.app.core.security import verify_access_token
                auth = request.headers.get("Authorization", "")
                if auth.startswith("Bearer "):
                    payload = verify_access_token(auth[7:], result)
                    org_id = payload.get("org_id")
                    if org_id:
                        org_prompt = await settings_db.load_org_system_prompt(session, org_id)
                        if org_prompt:
                            result = result.model_copy(update={"system_prompt": org_prompt})
            except Exception:
                pass  # best-effort
        return result
    except Exception:
        pass  # DB read failed — fall through to env settings
    return base


async def get_current_user(
    request: Request,
    settings: Settings = Depends(get_live_settings),
) -> dict:
    """
    Extract and validate Bearer JWT from the Authorization header.

    Returns the decoded payload dict: {sub, org_id, role, email}.
    Raises HTTP 401 if missing, malformed, or expired.
    """
    from memra.app.core.security import InvalidTokenError, verify_access_token

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")

    token = auth_header[len("Bearer "):]
    try:
        payload = verify_access_token(token, settings)
    except InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    return payload


def require_role(*roles: str):
    """
    Return a FastAPI dependency that enforces one of the given roles.

    Usage: Depends(require_role("owner", "admin"))
    """
    async def _inner(payload: dict = Depends(get_current_user)) -> dict:
        if payload.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return payload

    return _inner
