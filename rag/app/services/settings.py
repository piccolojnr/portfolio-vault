"""
Settings Service
================

Business logic for reading and writing runtime settings.
Merges env-file base config with DB overrides and handles
key masking so secrets are never exposed to callers.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.services import settings_db
from core.costs import ANTHROPIC_MODELS, EMBEDDING_MODELS, OPENAI_GEN_MODELS
from app.schemas.settings import DEFAULT_PERSONA_PROMPT, FIXED_SYSTEM_PROMPT_SUFFIX, RuntimeConfig, SettingsRead, SettingsUpdate


async def get_effective_settings(session: AsyncSession) -> SettingsRead:
    """Return current settings: env base overridden by DB values, keys masked."""
    base = get_settings()
    overrides, key_status = await _load(session, base.secret_key)
    effective = base.model_copy(update=overrides) if overrides else base

    return SettingsRead(
        openai_api_key_set=key_status.get("openai_api_key", False) or bool(base.openai_api_key),
        anthropic_api_key_set=key_status.get("anthropic_api_key", False) or bool(base.anthropic_api_key),
        embedding_model=effective.embedding_model,
        anthropic_model=effective.anthropic_model,
        openai_model=effective.openai_model,
        cost_limit_usd=effective.cost_limit_usd,
        # Returns editable persona only — the fixed rules/doc-format suffix is
        # never stored and is appended only in get_runtime_config.
        system_prompt=overrides.get("system_prompt") or DEFAULT_PERSONA_PROMPT,
        classifier_anthropic_model=overrides.get("classifier_anthropic_model") or base.classifier_anthropic_model,
        classifier_openai_model=overrides.get("classifier_openai_model") or base.classifier_openai_model,
        summarizer_anthropic_model=overrides.get("summarizer_anthropic_model") or base.summarizer_anthropic_model,
        summarizer_openai_model=overrides.get("summarizer_openai_model") or base.summarizer_openai_model,
        embedding_model_options=list(EMBEDDING_MODELS.keys()),
        anthropic_model_options=ANTHROPIC_MODELS,
        openai_model_options=OPENAI_GEN_MODELS,
    )


async def get_runtime_config(session: AsyncSession) -> RuntimeConfig:
    """Return decrypted keys + effective models + system prompt for server-to-server use."""
    base = get_settings()
    overrides, _ = await _load(session, base.secret_key)
    effective = base.model_copy(update=overrides) if overrides else base

    anthropic_key = overrides.get("anthropic_api_key") or base.anthropic_api_key
    openai_key = overrides.get("openai_api_key") or base.openai_api_key

    return RuntimeConfig(
        anthropic_api_key=anthropic_key,
        openai_api_key=openai_key,
        anthropic_model=effective.anthropic_model,
        openai_model=effective.openai_model,
        # Full prompt = editable persona + fixed rules/doc-format suffix
        system_prompt=(overrides.get("system_prompt") or DEFAULT_PERSONA_PROMPT) + FIXED_SYSTEM_PROMPT_SUFFIX,
        classifier_anthropic_model=overrides.get("classifier_anthropic_model") or base.classifier_anthropic_model,
        classifier_openai_model=overrides.get("classifier_openai_model") or base.classifier_openai_model,
        summarizer_anthropic_model=overrides.get("summarizer_anthropic_model") or base.summarizer_anthropic_model,
        summarizer_openai_model=overrides.get("summarizer_openai_model") or base.summarizer_openai_model,
    )


async def apply_update(session: AsyncSession, patch: SettingsUpdate) -> SettingsRead:
    """Persist a settings update then return the fresh effective state."""
    base = get_settings()
    await settings_db.save_settings(
        session, patch.model_dump(exclude_none=True), base.secret_key
    )
    return await get_effective_settings(session)


# ── helpers ────────────────────────────────────────────────────────────────────

async def _load(session: AsyncSession, secret_key: str) -> tuple[dict, dict]:
    """Fetch DB overrides and key status in one pass."""
    overrides = await settings_db.load_overrides(session, secret_key)
    key_status = await settings_db.get_key_status(session)
    return overrides, key_status
