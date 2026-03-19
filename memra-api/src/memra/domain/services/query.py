"""
Query Service
=============

Business logic for the /query endpoint.

Raises ValueError / LookupError — the router maps these to 400/404.
Returns (QueryResponse, usage_dict | None) so the router can log the call
without the service touching the DB session directly.
"""

from __future__ import annotations

from memra.app.core.config import Settings
from memra.domain.models.rag import QueryResponse, RetrievedChunk
from memra.domain.services.lightrag_service import CORPUS_ID, query as lr_query


async def run_query(question: str, n_results: int, settings: Settings):
    """Run a LightRAG hybrid query.

    Returns (QueryResponse, usage_dict | None).
    usage_dict is None because LightRAG does not expose per-query token counts.
    n_results is kept for API compatibility.
    """
    _ = n_results
    return await _lightrag(question, settings)


# ── LightRAG path ─────────────────────────────────────────────────────────────

async def _lightrag(
    question: str,
    settings: Settings,
) -> tuple[QueryResponse, None]:
    """Query via LightRAG hybrid graph+vector retrieval."""
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
