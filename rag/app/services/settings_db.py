"""
DB-backed settings helpers.

Reads/writes runtime settings from the `settings` (AppSetting) table so that
API keys and model choices can be changed at runtime without touching .env.

Secret values are stored encrypted using app.crypto.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.services.crypto import decrypt, encrypt
from app.models import AppSetting

# Settings keys that are stored encrypted
_SECRET_KEYS = {"openai_api_key", "anthropic_api_key"}

# All setting keys managed via the DB
_ALL_KEYS = {
    "openai_api_key",
    "anthropic_api_key",
    "embedding_model",
    "anthropic_model",
    "openai_model",
    "cost_limit_usd",
}


async def load_overrides(session: AsyncSession, secret_key: str) -> dict:
    """
    Read all managed settings from DB and return as a plain dict
    that can be passed to Settings.model_copy(update=...).

    Secret values are decrypted. Empty stored values are skipped.
    """
    rows = (
        await session.execute(select(AppSetting).where(AppSetting.key.in_(_ALL_KEYS)))
    ).scalars().all()

    overrides: dict = {}
    for row in rows:
        if not row.value:
            continue
        if row.key in _SECRET_KEYS:
            decoded = decrypt(row.value, secret_key)
            if decoded:
                overrides[row.key] = decoded
        elif row.key == "cost_limit_usd":
            try:
                overrides[row.key] = float(row.value)
            except ValueError:
                pass
        else:
            overrides[row.key] = row.value

    return overrides


async def save_settings(
    session: AsyncSession,
    updates: dict,
    secret_key: str,
) -> None:
    """
    Write a dict of setting updates to the DB.

    Pass `None` for a key to leave it unchanged.
    Pass `""` for a secret key to clear it.
    """
    for key, value in updates.items():
        if key not in _ALL_KEYS or value is None:
            continue

        stored_value: str
        if key in _SECRET_KEYS:
            stored_value = encrypt(str(value), secret_key) if value else ""
        else:
            stored_value = str(value)

        row = await session.get(AppSetting, key)
        if row is None:
            row = AppSetting(key=key, value=stored_value, is_secret=(key in _SECRET_KEYS))
        else:
            row.value = stored_value
        session.add(row)

    await session.commit()


async def get_key_status(session: AsyncSession) -> dict[str, bool]:
    """Return {key: is_set} for secret keys — never exposes the values."""
    rows = (
        await session.execute(
            select(AppSetting).where(AppSetting.key.in_(_SECRET_KEYS))
        )
    ).scalars().all()
    result = {k: False for k in _SECRET_KEYS}
    for row in rows:
        result[row.key] = bool(row.value)
    return result
