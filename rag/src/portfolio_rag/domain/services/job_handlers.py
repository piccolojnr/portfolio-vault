"""
Job handlers
============

One async function per job type.  Each handler receives the raw payload dict
and is responsible for its own DB/LLM calls.  Errors bubble up to the worker,
which records them via job_queue.fail().
"""

from __future__ import annotations

import logging
from uuid import UUID

logger = logging.getLogger(__name__)


async def handle_ingest_document(payload: dict) -> None:
    """
    payload: { "document_id": str, "corpus_id": str }
    Delegates entirely to ingestion_service.ingest_document, which handles
    processing→ready/failed status transitions.
    """
    from portfolio_rag.app.core.config import get_settings
    from portfolio_rag.domain.services.ingestion_service import ingest_document

    doc_id = payload["document_id"]
    settings = get_settings()
    logger.info("[handler] ingest_document doc_id=%s", doc_id)
    await ingest_document(doc_id, settings)


async def handle_reingest_document(payload: dict) -> None:
    """
    payload: { "document_id": str, "corpus_id": str }
    Resets the lightrag_status to "pending" before re-running ingestion so the
    document appears as "processing" while the worker is active.

    TODO: Add per-document LightRAG graph node deletion when the library
    exposes a stable API for it.
    """
    from portfolio_rag.app.core.config import get_settings
    from portfolio_rag.app.core.db import open_db_engine
    from portfolio_rag.domain.services import document as doc_svc
    from portfolio_rag.domain.services.ingestion_service import ingest_document

    doc_id = payload["document_id"]
    settings = get_settings()

    # Reset status so the UI shows "processing" while the worker runs
    engine, factory = await open_db_engine(settings.database_url)
    try:
        async with factory() as session:
            try:
                doc = await doc_svc.get_document_by_id(session, doc_id)
            except LookupError:
                logger.warning("[handler] reingest_document: doc not found id=%s", doc_id)
                return
            doc.doc_metadata = {
                **(doc.doc_metadata or {}),
                "lightrag_status": "pending",
                "error": None,
            }
            session.add(doc)
            await session.commit()
    finally:
        await engine.dispose()

    logger.info("[handler] reingest_document doc_id=%s", doc_id)
    await ingest_document(doc_id, settings)


async def handle_summarise_conversation(payload: dict) -> None:
    """
    payload: {
        "conversation_id": str,
        "messages_to_summarise": [{"role": str, "content": str}, ...],
        "existing_summary": str,
        "newest_trimmed_id": str,
    }
    Builds a rolling summary and persists it to the conversation row.
    """
    from types import SimpleNamespace

    from portfolio_rag.app.core.config import get_settings
    from portfolio_rag.app.core.db import open_db_engine
    from portfolio_rag.domain.services import conversations as conv_svc
    from portfolio_rag.domain.services.summarizer import (
        _build_prompt,
        _summarise_with_anthropic,
        _summarise_with_openai,
    )

    conv_id = payload["conversation_id"]
    raw_messages = payload["messages_to_summarise"]
    existing_summary = payload.get("existing_summary") or None
    newest_trimmed_id = payload["newest_trimmed_id"]

    # Wrap raw dicts as SimpleNamespace so _build_prompt can use .role / .content
    messages = [SimpleNamespace(**m) for m in raw_messages]

    settings = get_settings()
    prompt = _build_prompt(messages, existing_summary)

    if settings.anthropic_api_key:
        new_summary = await _summarise_with_anthropic(
            prompt, settings.anthropic_api_key, settings.summarizer_anthropic_model
        )
    else:
        new_summary = await _summarise_with_openai(
            prompt, settings.openai_api_key, settings.summarizer_openai_model
        )

    engine, factory = await open_db_engine(settings.database_url)
    try:
        async with factory() as session:
            await conv_svc.update_summary(
                session,
                UUID(conv_id),
                new_summary,
                UUID(newest_trimmed_id),
            )
    finally:
        await engine.dispose()

    logger.info("[handler] summarise_conversation conv_id=%s", conv_id)
