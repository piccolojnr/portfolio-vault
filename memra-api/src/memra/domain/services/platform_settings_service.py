"""
Platform Settings Service
==========================

Reads/writes platform-wide settings from the platform_settings table.
Provides a 5-minute in-memory TTL cache with immediate invalidation on write.
Falls back to env vars when a key has no DB value.
"""

from __future__ import annotations

import time
import threading
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from memra.infrastructure.db.models.platform_setting import PlatformSetting
from memra.shared.crypto import decrypt, encrypt

_cache: dict[str, str | None] = {}
_cache_ts: float = 0.0
_cache_lock = threading.Lock()
_TTL = 300  # 5 minutes

# Maps platform_settings keys to Settings field names for env-var fallback
_KEY_TO_ENV = {
    "openai_api_key": "openai_api_key",
    "anthropic_api_key": "anthropic_api_key",
    "chat_model": "anthropic_model",
    "classifier_model": "classifier_anthropic_model",
    "summariser_model": "summarizer_anthropic_model",
    "embedding_model": "embedding_model",
    "email_backend": "email_backend",
    "email_from": "email_from",
    "resend_api_key": "resend_api_key",
    "storage_provider": "storage_provider",
    "paystack_secret_key": "paystack_secret_key",
    "paystack_public_key": "paystack_public_key",
    "paystack_pro_plan_code": "paystack_pro_plan_code",
    "paystack_enterprise_plan_code": "paystack_enterprise_plan_code",
}

_SECRET_KEYS = {
    "openai_api_key",
    "anthropic_api_key",
    "resend_api_key",
    "paystack_secret_key",
}


def invalidate_cache() -> None:
    """Force next read to hit DB."""
    global _cache_ts
    with _cache_lock:
        _cache_ts = 0.0


async def _refresh_cache(session: AsyncSession, secret_key: str) -> dict[str, str | None]:
    global _cache, _cache_ts
    now = time.time()
    with _cache_lock:
        if now - _cache_ts < _TTL:
            return dict(_cache)

    rows = (await session.execute(select(PlatformSetting))).scalars().all()
    new_cache: dict[str, str | None] = {}
    for row in rows:
        val = row.value
        if val and row.is_secret:
            val = decrypt(val, secret_key)
        new_cache[row.key] = val

    with _cache_lock:
        _cache = new_cache
        _cache_ts = time.time()
    return dict(new_cache)


async def get_all(session: AsyncSession, secret_key: str) -> dict[str, str | None]:
    """Return all platform settings (secrets decrypted) with cache."""
    return await _refresh_cache(session, secret_key)


async def get_value(
    session: AsyncSession, key: str, secret_key: str, *, fallback_settings=None
) -> Optional[str]:
    """Get a single platform setting value. Falls back to env var."""
    cache = await _refresh_cache(session, secret_key)
    val = cache.get(key)
    if val:
        return val
    if fallback_settings and key in _KEY_TO_ENV:
        return getattr(fallback_settings, _KEY_TO_ENV[key], None) or None
    return None


async def set_value(
    session: AsyncSession,
    key: str,
    value: str,
    secret_key: str,
    *,
    admin_id: str | None = None,
) -> None:
    """Update a single platform setting. Invalidates cache."""
    from memra.infrastructure.db.models.base import utcnow
    import uuid

    row = await session.get(PlatformSetting, key)
    if row is None:
        raise ValueError(f"Unknown setting key: {key}")

    if row.is_secret and value:
        row.value = encrypt(value, secret_key)
    else:
        row.value = value

    row.updated_at = utcnow()
    if admin_id:
        row.updated_by = uuid.UUID(admin_id)
    session.add(row)
    await session.commit()
    invalidate_cache()


async def get_all_masked(session: AsyncSession, *, fallback_settings=None) -> list[dict]:
    """Return all settings with secrets masked (for admin UI).

    When *fallback_settings* (a ``Settings`` instance) is provided, the
    response will also reflect env-var values for keys that have no DB
    entry, and include a ``source`` field ("database", "environment", or
    "none") so the admin UI can indicate where the value comes from.
    """
    rows = (await session.execute(
        select(PlatformSetting).order_by(PlatformSetting.key)
    )).scalars().all()

    result = []
    for row in rows:
        db_has_value = bool(row.value)

        env_value = None
        if fallback_settings and row.key in _KEY_TO_ENV:
            env_value = getattr(fallback_settings, _KEY_TO_ENV[row.key], None) or None

        has_value = db_has_value or bool(env_value)
        source = "database" if db_has_value else ("environment" if env_value else "none")

        if row.is_secret and has_value:
            display_value = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
        elif db_has_value:
            display_value = row.value
        elif env_value:
            display_value = str(env_value)
        else:
            display_value = ""

        result.append({
            "key": row.key,
            "value": display_value,
            "is_secret": row.is_secret,
            "description": row.description or "",
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            "has_value": has_value,
            "source": source,
        })
    return result


async def reveal_secret(
    session: AsyncSession, key: str, secret_key: str, *, fallback_settings=None
) -> str | None:
    """Decrypt and return a secret value. Caller must log this action."""
    row = await session.get(PlatformSetting, key)
    if row is not None and row.value:
        if row.is_secret:
            return decrypt(row.value, secret_key)
        return row.value
    if fallback_settings and key in _KEY_TO_ENV:
        return getattr(fallback_settings, _KEY_TO_ENV[key], None) or None
    return None


async def build_settings_overrides(session: AsyncSession, secret_key: str) -> dict:
    """
    Build a dict of overrides suitable for Settings.model_copy(update=...).
    Used by get_live_settings to overlay platform DB values on env defaults.
    """
    cache = await _refresh_cache(session, secret_key)
    overrides: dict = {}
    for ps_key, env_field in _KEY_TO_ENV.items():
        val = cache.get(ps_key)
        if val:
            if env_field == "cost_limit_usd":
                try:
                    overrides[env_field] = float(val)
                except ValueError:
                    pass
            else:
                overrides[env_field] = val
    return overrides
