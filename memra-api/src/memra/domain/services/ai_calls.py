"""
AI call logger
==============

Single function to insert a row into ai_calls.  All LLM call sites use this
so cost data is in one place.

Usage:
    from memra.domain.services.ai_calls import log_call

    async with db_session_factory() as session:
        await log_call(session, "chat",
            model="claude-sonnet-4-6", provider="anthropic",
            input_tokens=512, output_tokens=128,
            conversation_id=conv_id)
        await session.commit()
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

# Per-million-token prices (USD).  Update when provider pricing changes.
_PRICES: dict[str, dict[str, float]] = {
    "anthropic": {
        "claude-opus-4-6":          {"input": 15.0,  "output": 75.0},
        "claude-sonnet-4-6":        {"input": 3.0,   "output": 15.0},
        "claude-haiku-4-5-20251001":{"input": 0.8,   "output": 4.0},
        # fallback
        "_default":                 {"input": 3.0,   "output": 15.0},
    },
    "openai": {
        "gpt-4o":                   {"input": 2.5,   "output": 10.0},
        "gpt-4o-mini":              {"input": 0.15,  "output": 0.6},
        # fallback
        "_default":                 {"input": 2.5,   "output": 10.0},
    },
}


def compute_cost(
    provider: str,
    model: str,
    input_tokens: int | None,
    output_tokens: int | None,
) -> float | None:
    """Return estimated cost in USD, or None if token counts are missing."""
    if input_tokens is None or output_tokens is None:
        return None
    table = _PRICES.get(provider, {})
    prices = table.get(model) or table.get("_default")
    if not prices:
        return None
    return (input_tokens * prices["input"] + output_tokens * prices["output"]) / 1_000_000


async def log_call(
    session: AsyncSession,
    call_type: str,
    *,
    model: str,
    provider: str,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    cost_usd: float | None = None,
    job_id: str | None = None,
    conversation_id: str | None = None,
    doc_id: str | None = None,
    org_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    duration_ms: int | None = None,
) -> None:
    """Insert an ai_calls row.  Caller is responsible for committing."""
    from memra.infrastructure.db.models.ai_call import AiCall

    row = AiCall(
        call_type=call_type,
        model=model,
        provider=provider,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=cost_usd if cost_usd is not None else compute_cost(
            provider, model, input_tokens, output_tokens
        ),
        job_id=uuid.UUID(job_id) if job_id else None,
        conversation_id=uuid.UUID(conversation_id) if conversation_id else None,
        doc_id=uuid.UUID(doc_id) if doc_id else None,
        org_id=org_id,
        user_id=user_id,
        duration_ms=duration_ms,
    )
    session.add(row)
    await session.flush()
