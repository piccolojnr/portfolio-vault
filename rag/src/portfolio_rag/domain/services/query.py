"""
Query Service
=============

Business logic for the /query endpoint.

Raises ValueError / LookupError — the router maps these to 400/404.
Returns (QueryResponse, usage_dict | None) so the router can log the call
without the service touching the DB session directly.
"""

from __future__ import annotations

from portfolio_rag.app.core.config import Settings
from portfolio_rag.domain.models.rag import QueryResponse, RetrievedChunk
from portfolio_rag import retrieve_and_answer


async def run_query(question: str, n_results: int, settings: Settings):
    """Route to legacy Qdrant or LightRAG based on settings flag.

    Returns (QueryResponse, usage_dict | None).
    usage_dict is None for the LightRAG path (token counts unavailable).
    """
    if settings.use_legacy_retrieval:
        return await _legacy(question, n_results, settings)
    return await _lightrag(question, settings)


# ── legacy path (Qdrant + LLM) ────────────────────────────────────────────────

async def _legacy(
    question: str,
    n_results: int,
    settings: Settings,
) -> tuple[QueryResponse, dict | None]:
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

    return response, usage or None


# ── LightRAG path ─────────────────────────────────────────────────────────────

async def _lightrag(
    question: str,
    settings: Settings,
) -> tuple[QueryResponse, None]:
    """Query via LightRAG hybrid graph+vector retrieval.

    Cost logging is omitted: LightRAG does not surface per-query token counts.
    """
    from portfolio_rag.domain.services.lightrag_service import CORPUS_ID, query as lr_query

    result = await lr_query(CORPUS_ID, question, settings, mode="hybrid")

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
