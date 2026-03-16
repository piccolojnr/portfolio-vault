"""
Query Service
=============

Business logic for the /query endpoint.

Raises ValueError / LookupError — the router maps these to 400/404.
Returns (QueryResponse, QueryLog | None) so the router can persist the log
row without the service touching the DB session directly.
"""

from __future__ import annotations

from portfolio_rag.app.core.config import Settings
from portfolio_rag.infrastructure.db import QueryLog
from portfolio_rag.domain.models.rag import QueryResponse, RetrievedChunk
from portfolio_rag import retrieve_and_answer


async def run_query(question: str, n_results: int, settings: Settings):
    """Route to legacy Qdrant or LightRAG based on settings flag.

    Returns (QueryResponse, QueryLog | None).
    The log row is None for the LightRAG path (token counts unavailable).
    The caller is responsible for persisting the log row to the DB.
    """
    if settings.use_legacy_retrieval:
        return await _legacy(question, n_results, settings)
    return await _lightrag(question, settings)


# ── legacy path (Qdrant + LLM) ────────────────────────────────────────────────

async def _legacy(
    question: str,
    n_results: int,
    settings: Settings,
) -> tuple[QueryResponse, QueryLog | None]:
    answer, chunks, usage = retrieve_and_answer(
        question, settings=settings, n_results=n_results
    )

    if not chunks:
        raise LookupError("No relevant chunks found")

    response = QueryResponse(
        question=question,
        retrieved_chunks=[
            RetrievedChunk(
                content=c["content"],
                source=c["source"],
                heading=c["heading"],
                similarity=c["similarity"],
            )
            for c in chunks
        ],
        answer=answer,
        mode="demo" if settings.use_demo else "real",
    )

    log: QueryLog | None = None
    if usage:
        log = QueryLog(
            question=question,
            model=usage.get("model"),
            provider=usage.get("provider"),
            input_tokens=usage.get("input_tokens"),
            output_tokens=usage.get("output_tokens"),
            total_tokens=usage.get("total_tokens"),
            cost_usd=usage.get("cost_usd"),
        )

    return response, log


# ── LightRAG path ─────────────────────────────────────────────────────────────

async def _lightrag(
    question: str,
    settings: Settings,
) -> tuple[QueryResponse, None]:
    """Query via LightRAG hybrid graph+vector retrieval.

    Cost logging is omitted: LightRAG does not surface per-query token counts
    from aquery.  The log row is always None on this path.

    The 404 guard is intentionally absent: LightRAG can answer from the graph
    alone even when no text chunks are returned, so an empty chunks list does
    not mean the query failed.
    """
    from portfolio_rag.domain.services.lightrag_service import CORPUS_ID, query as lr_query

    result = await lr_query(CORPUS_ID, question, settings, mode="hybrid")

    # Map LightRAG chunks → RetrievedChunk.
    # file_path = the document_id stored at ingest time (VaultDocument UUID).
    # heading and similarity are not provided by LightRAG's chunk format.
    retrieved = [
        RetrievedChunk(
            content=c.get("content", ""),
            source=c.get("file_path", "unknown"),
            heading="",
            similarity=0.0,
        )
        for c in result.chunks
    ]

    return QueryResponse(
        question=question,
        retrieved_chunks=retrieved,
        answer=result.answer,
        mode="lightrag",
    ), None
