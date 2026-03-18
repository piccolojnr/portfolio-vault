"""
core/chat_pipeline.py
---------------------
Streaming response handlers for each classified intent.

Ports lib/chat-pipeline.ts + the orchestration from app/api/chat/route.ts.

Each handler is an async generator yielding raw SSE event strings:
  data: {"text": "..."}           — streamed text delta
  data: {"saved": {...}}          — emitted after DB persistence (if conv_id given)
  data: [DONE]                    — end sentinel
  data: {"error": "...", "stage": "llm_start"|"llm_stream"}  — on error

Intent → handler mapping:
  conversational  → no RAG, natural reply
  retrieval       → RAG on, answer from vault chunks
  document        → RAG on, generate formatted document
  refinement      → prior document as context, RAG only if needed
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import AsyncGenerator
from uuid import UUID

from portfolio_rag.domain.services.intent import Classification

logger = logging.getLogger(__name__)

# ── Source resolution ──────────────────────────────────────────────────────────

async def _resolve_sources(chunks: list[dict], db_session_factory) -> list[dict]:
    """Resolve retrieved chunks to vault documents.

    Iterates all chunks in order, looks up each by UUID (LightRAG file_path) or
    slug (legacy), deduplicates by document id, and assigns sequential ref numbers.
    Does not depend on [N] citation markers in the LLM answer.
    """
    if not chunks or not db_session_factory:
        return []
    from portfolio_rag.infrastructure.db.models.document import Document
    from sqlmodel import select
    seen_ids: set[str] = set()
    results: list[dict] = []
    async with db_session_factory() as session:
        for i, chunk in enumerate(chunks):
            source = chunk.get("source", "")
            if not source:
                continue
            doc = None
            try:
                from uuid import UUID as _UUID
                doc = await session.get(Document, _UUID(source))
            except (ValueError, AttributeError):
                pass
            if doc is None:
                doc = (await session.execute(
                    select(Document).where(Document.slug == source)
                )).scalars().first()
            if doc and str(doc.id) not in seen_ids:
                seen_ids.add(str(doc.id))
                results.append({
                    "ref": i + 1,
                    "source_id": str(doc.id),
                    "title": doc.title or doc.slug,
                    "slug": doc.slug,
                    "doc_type": doc.type,
                })
    return results

# ── Constants ─────────────────────────────────────────────────────────────────

DOC_RE = re.compile(r'<document\s+type="([^"]+)"\s+title="([^"]+)">([\s\S]+?)<\/document>')
MAX_TOKENS = 2000
CORPUS_ID = "portfolio_vault"


# ── Shared helpers ─────────────────────────────────────────────────────────────

def _extract_doc_type(content: str) -> str | None:
    m = DOC_RE.search(content)
    return m.group(1) if m else None


def _extract_last_document(history: list[dict]) -> str | None:
    """Finds the full content of the last assistant message containing a <document> block."""
    for msg in reversed(history):
        if msg["role"] == "assistant" and DOC_RE.search(msg["content"]):
            return msg["content"]
    return None


def format_context(chunks: list[dict]) -> str:
    """Format retrieved chunks into a readable context block for the LLM prompt."""
    lines = []
    for i, c in enumerate(chunks):
        lines.append(
            f"[{i + 1}] Source: {c['source']} / {c['heading']}\n"
            f"Score: {c['similarity']:.3f}\n"
            f"{c['content']}"
        )
    return "\n\n---\n\n".join(lines)


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


# ── DB persistence ─────────────────────────────────────────────────────────────

async def _persist_messages(
    conv_id: str,
    user_message: str,
    assistant_content: str,
    doc_type: str | None,
    meta: dict | None,
    db_session_factory,
    sources: list[dict] | None = None,
    settings=None,
) -> dict | None:
    """Persists user + assistant messages. Returns saved assistant message metadata.

    If the conversation has no title yet, fires auto_title_bg as a background task.
    """
    from portfolio_rag.domain.services import conversations as svc
    try:
        async with db_session_factory() as session:
            await svc.add_message(session, UUID(conv_id), "user", user_message, None, None)
            msg = await svc.add_message(
                session, UUID(conv_id), "assistant", assistant_content, doc_type, meta,
                sources=sources,
            )
            needs_title = await svc.needs_title(session, UUID(conv_id))

        if needs_title and settings:
            asyncio.create_task(
                svc.auto_title_bg(
                    db_session_factory, UUID(conv_id),
                    user_message, assistant_content, settings,
                )
            )

        return {"id": str(msg.id), "created_at": msg.created_at.isoformat()}
    except Exception as err:
        logger.error("[chat_pipeline] persistMessages failed: %s", err)
        return None


# ── Core LLM streaming ─────────────────────────────────────────────────────────

async def _stream_llm(
    messages: list[dict],
    user_message: str,
    conv_id: str | None,
    meta: dict | None,
    settings,
    db_session_factory,
    chunks: list[dict] | None = None,
) -> AsyncGenerator[str, None]:
    """
    Stream from whichever LLM is configured, accumulate, persist, emit [DONE].

    Yields SSE event strings throughout. After the stream ends (no error),
    persists messages to DB and yields a 'saved' event followed by [DONE].
    On error, yields an error event and [DONE].
    """
    if not settings.anthropic_api_key and not settings.openai_api_key:
        yield _sse({
            "error": "No LLM provider available. Configure API keys in the settings page.",
            "stage": "llm_start",
        })
        yield "data: [DONE]\n\n"
        return

    system_prompt = getattr(settings, "system_prompt", "You are a helpful career assistant.")
    accumulated = ""
    usage_dict: dict | None = None

    try:
        if settings.anthropic_api_key:
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
            async with client.messages.stream(
                model=settings.anthropic_model,
                max_tokens=MAX_TOKENS,
                system=system_prompt,
                messages=messages,
            ) as stream:
                async for text in stream.text_stream:
                    accumulated += text
                    yield _sse({"text": text})
                final = await stream.get_final_message()
                usage_dict = {
                    "provider": "anthropic",
                    "model": settings.anthropic_model,
                    "input_tokens": final.usage.input_tokens,
                    "output_tokens": final.usage.output_tokens,
                }
        else:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=settings.openai_api_key)
            full_messages = [{"role": "system", "content": system_prompt}, *messages]
            stream = await client.chat.completions.create(
                model=settings.openai_model,
                max_tokens=MAX_TOKENS,
                messages=full_messages,
                stream=True,
                stream_options={"include_usage": True},
            )
            async for chunk in stream:
                if chunk.choices:
                    text = chunk.choices[0].delta.content or ""
                    if text:
                        accumulated += text
                        yield _sse({"text": text})
                if getattr(chunk, "usage", None):
                    usage_dict = {
                        "provider": "openai",
                        "model": settings.openai_model,
                        "input_tokens": chunk.usage.prompt_tokens,
                        "output_tokens": chunk.usage.completion_tokens,
                    }

    except Exception as err:
        stage = "llm_stream" if accumulated else "llm_start"
        yield _sse({"error": str(err), "stage": stage})
        yield "data: [DONE]\n\n"
        return

    # Post-stream: resolve sources, persist messages, emit 'saved' + 'sources' events
    doc_type = _extract_doc_type(accumulated)
    sources = await _resolve_sources(chunks or [], db_session_factory)
    if conv_id and db_session_factory:
        saved = await _persist_messages(
            conv_id, user_message, accumulated, doc_type, meta, db_session_factory,
            sources=sources, settings=settings,
        )
        yield _sse({
            "saved": {
                "doc_type": doc_type,
                "meta": meta,
                "id": saved["id"] if saved else None,
                "created_at": saved["created_at"] if saved else None,
            }
        })
    yield _sse({"sources": sources})

    # Log AI call best-effort
    if usage_dict and db_session_factory:
        try:
            from portfolio_rag.domain.services.ai_calls import log_call
            async with db_session_factory() as _session:
                await log_call(
                    _session, "chat",
                    model=usage_dict["model"],
                    provider=usage_dict["provider"],
                    input_tokens=usage_dict["input_tokens"],
                    output_tokens=usage_dict["output_tokens"],
                    conversation_id=conv_id,
                )
                await _session.commit()
        except Exception:
            pass

    yield "data: [DONE]\n\n"


# ── Retrieval dispatch ─────────────────────────────────────────────────────────

async def _retrieve(message: str, settings, mode: str = "local") -> list[dict]:
    """Dispatch retrieval to legacy Qdrant or LightRAG based on settings flag.

    mode is passed through to LightRAG's QueryParam.  Valid values:
      "local"  — entity-focused retrieval, no global graph traversal (default, fastest)
      "hybrid" — local + global community summaries
      "global" — community summaries only
      "naive"  — vector search only, no graph
    Ignored when use_legacy_retrieval=True (legacy path has no mode concept).
    """
    if settings.use_legacy_retrieval:
        from portfolio_rag.domain.services.retrieval import retrieve_legacy
        return await asyncio.to_thread(retrieve_legacy, message, settings, 5)
    else:
        from portfolio_rag.domain.services.lightrag_service import CORPUS_ID as _CID, query as lr_query
        result = await lr_query(_CID, message, settings, mode=mode)
        # Normalise LightRAG chunk keys to match legacy format
        return [
            {
                "content": c.get("content", ""),
                "source": c.get("file_path", "unknown"),
                "heading": "",
                "similarity": 0.0,
            }
            for c in result.chunks
        ]


# ── Intent handlers ────────────────────────────────────────────────────────────

async def _handle_conversational(
    message: str,
    history: list[dict],
    conv_id: str | None,
    settings,
    db_session_factory,
) -> AsyncGenerator[str, None]:
    logger.info("[chat] conversational — skipping RAG")
    meta = {"intent": "conversational", "rag_retrieved": False, "chunks_count": 0}
    messages = [*history, {"role": "user", "content": message}]
    async for event in _stream_llm(messages, message, conv_id, meta, settings, db_session_factory, chunks=None):
        yield event


async def _handle_retrieval(
    message: str,
    history: list[dict],
    conv_id: str | None,
    settings,
    db_session_factory,
    prefetched_chunks: list[dict] | None = None,
) -> AsyncGenerator[str, None]:
    chunks = prefetched_chunks if prefetched_chunks is not None else await _retrieve(message, settings)
    logger.info("[chat] retrieval — %d chunks", len(chunks))
    context = format_context(chunks)
    augmented = f"Relevant context from my portfolio vault:\n\n{context}\n\n---\n\n{message}"
    messages = [*history, {"role": "user", "content": augmented}]
    meta = {"intent": "retrieval", "rag_retrieved": True, "chunks_count": len(chunks)}
    async for event in _stream_llm(messages, message, conv_id, meta, settings, db_session_factory, chunks=chunks):
        yield event


async def _handle_document(
    message: str,
    history: list[dict],
    conv_id: str | None,
    settings,
    db_session_factory,
    prefetched_chunks: list[dict] | None = None,
) -> AsyncGenerator[str, None]:
    chunks = prefetched_chunks if prefetched_chunks is not None else await _retrieve(message, settings)
    logger.info("[chat] document — %d chunks", len(chunks))
    context = format_context(chunks)
    augmented = f"Relevant context from my portfolio vault:\n\n{context}\n\n---\n\n{message}"
    messages = [*history, {"role": "user", "content": augmented}]
    meta = {"intent": "document", "rag_retrieved": True, "chunks_count": len(chunks)}
    async for event in _stream_llm(messages, message, conv_id, meta, settings, db_session_factory, chunks=chunks):
        yield event


async def _handle_refinement(
    message: str,
    history: list[dict],
    conv_id: str | None,
    needs_rag: bool,
    settings,
    db_session_factory,
    prefetched_chunks: list[dict] | None = None,
) -> AsyncGenerator[str, None]:
    prior_doc = _extract_last_document(history)
    context_block = (
        f"Here is the document you previously generated:\n\n{prior_doc}\n\n"
        if prior_doc else ""
    )

    chunks_count = 0
    rag_chunks: list[dict] = []
    if needs_rag:
        rag_chunks = prefetched_chunks if prefetched_chunks is not None else await _retrieve(message, settings)
        chunks_count = len(rag_chunks)
        extra = format_context(rag_chunks)
        context_block += f"Additional context from my portfolio vault:\n\n{extra}\n\n"
        logger.info("[chat] refinement + RAG — %d chunks", chunks_count)
    else:
        logger.info("[chat] refinement — no RAG, using prior document only")

    user_content = (
        f"{context_block}---\n\nUser's request: {message}"
        if context_block else message
    )
    messages = [*history, {"role": "user", "content": user_content}]
    meta = {"intent": "refinement", "rag_retrieved": needs_rag, "chunks_count": chunks_count}
    async for event in _stream_llm(messages, message, conv_id, meta, settings, db_session_factory, chunks=rag_chunks if needs_rag else None):
        yield event


# ── Public API ─────────────────────────────────────────────────────────────────

async def stream_response(
    classification: Classification,
    message: str,
    history: list[dict],
    conversation_id: str | None,
    settings,
    db_session_factory,
    prefetched_chunks: list[dict] | None = None,
) -> AsyncGenerator[str, None]:
    """
    Routes a classified message to the appropriate handler and yields SSE events.

    prefetched_chunks: when provided (parallelised fetch path in chat.py), these
    are passed directly to the handler so retrieval is not repeated.
    """
    intent = classification.intent
    needs_rag = classification.needs_rag

    if intent == "conversational":
        gen = _handle_conversational(message, history, conversation_id, settings, db_session_factory)
    elif intent == "retrieval":
        gen = _handle_retrieval(message, history, conversation_id, settings, db_session_factory, prefetched_chunks=prefetched_chunks)
    elif intent == "document":
        gen = _handle_document(message, history, conversation_id, settings, db_session_factory, prefetched_chunks=prefetched_chunks)
    elif intent == "refinement":
        gen = _handle_refinement(message, history, conversation_id, needs_rag, settings, db_session_factory, prefetched_chunks=prefetched_chunks)
    else:
        # Exhaustiveness guard — unknown intent falls back to retrieval
        gen = _handle_retrieval(message, history, conversation_id, settings, db_session_factory, prefetched_chunks=prefetched_chunks)

    async for event in gen:
        yield event
