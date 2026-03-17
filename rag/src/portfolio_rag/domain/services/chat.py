"""
Chat Service
============

Business logic for the /chat/stream endpoint.

Orchestrates:
  1. Settings assembly  — merges runtime config (decrypted keys + system_prompt)
                          with live feature flags (use_legacy_retrieval)
  2. History resolution — fetches authoritative history from DB, trims to token
                          budget, injects rolling summary if trim occurred
  3. Intent classification
  4. SSE event streaming via domain.services.chat_pipeline
  5. Fire-and-forget background summarisation after the stream ends

Returns an async generator of raw SSE strings; the router wraps it in
StreamingResponse and owns no business logic.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import AsyncGenerator
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from portfolio_rag.app.core.config import Settings
from portfolio_rag.domain.services import conversations as conv_svc
from portfolio_rag.domain.services import settings as settings_svc
from portfolio_rag.domain.services import job_queue
from portfolio_rag.shared.context import inject_summary, trim_to_token_budget
from portfolio_rag.domain.services.intent import classify_intent
from portfolio_rag.domain.services.summarizer import MIN_DROPPED_TO_SUMMARISE
from portfolio_rag.domain.services import chat_pipeline


async def build_event_stream(
    message: str,
    history: list[dict],
    conversation_id: str | None,
    session: AsyncSession,
    db_session_factory,
    live_settings: Settings,
) -> AsyncGenerator[str, None]:
    """
    Prepare and return the SSE generator for a single chat turn.

    Callers must NOT await the generator — pass it directly to StreamingResponse.
    """
    # ── Step 1: Assemble settings ─────────────────────────────────────────────
    # RuntimeConfig has decrypted keys + system_prompt (assembled from DB).
    # live_settings (Settings) has infra fields from .env that RuntimeConfig
    # omits: qdrant_url, qdrant_api_key, qdrant_collection, qdrant_local_path,
    # database_url, use_legacy_retrieval.
    # Layer: live_settings base → RuntimeConfig overlay (so decrypted DB keys win).
    runtime = await settings_svc.get_runtime_config(session)
    _settings_dict = live_settings.model_dump()
    _settings_dict.update(runtime.model_dump())  # runtime wins for overlapping keys
    chat_settings = SimpleNamespace(**_settings_dict)

    # ── Steps 2a-2c: Fetch, trim, inject ──────────────────────────────────────
    summary_trigger: dict | None = None

    if conversation_id:
        try:
            conv = await conv_svc.get_conversation(session, UUID(conversation_id))
        except LookupError:
            conv = None

        if conv and conv.messages:
            trim = trim_to_token_budget(conv.messages)

            if trim.dropped_count > 0 and trim.newest_trimmed_message_id:
                summary_trigger = {
                    "conv_id": conversation_id,
                    "dropped_messages": trim.dropped_messages,
                    "newest_trimmed_id": trim.newest_trimmed_message_id,
                    "existing_summary": conv.summary,
                    "summarised_up_to_id": (
                        str(conv.summarised_up_to_message_id)
                        if conv.summarised_up_to_message_id else None
                    ),
                }

            history = (
                inject_summary(conv.summary, trim.kept_messages)
                if trim.dropped_count > 0 and conv.summary
                else trim.kept_messages
            )

    # ── Step 3: Classify intent ───────────────────────────────────────────────
    classification = await classify_intent(
        message, history, chat_settings,
        db_session_factory=db_session_factory,
        conversation_id=conversation_id,
    )

    # ── Steps 4-5: Stream + background summarisation ──────────────────────────
    async def _generate() -> AsyncGenerator[str, None]:
        async for event in chat_pipeline.stream_response(
            classification,
            message,
            history,
            conversation_id,
            chat_settings,
            db_session_factory,
        ):
            yield event

        if (
            summary_trigger
            and summary_trigger["newest_trimmed_id"]
            and summary_trigger["newest_trimmed_id"] != summary_trigger["summarised_up_to_id"]
            and len(summary_trigger["dropped_messages"]) > MIN_DROPPED_TO_SUMMARISE
        ):
            payload = {
                "conversation_id": summary_trigger["conv_id"],
                "messages_to_summarise": [
                    {"role": m.role, "content": m.content}
                    for m in summary_trigger["dropped_messages"]
                ],
                "existing_summary": summary_trigger["existing_summary"] or "",
                "newest_trimmed_id": str(summary_trigger["newest_trimmed_id"]),
            }
            async with db_session_factory() as _session:
                await job_queue.enqueue(_session, "summarise_conversation", payload)
                await _session.commit()

    return _generate()
