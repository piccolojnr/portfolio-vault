"""
Pipeline Service
================

Business logic for pipeline run listing, cost estimation, and SSE streaming.
Raises ValueError (bad input) or LookupError (not found) — routers
map these to 400/404 HTTP responses.

The SSE pipeline (pipeline_event_stream) now uses LightRAG ingestion via
core.ingestion_service.ingest_document.  The old chunk→embed→Qdrant path
(index_all_docs) has been replaced; the Qdrant-based retrieve path continues
to serve queries while settings.use_legacy_retrieval is True.

SSE event shapes emitted (unchanged for frontend compatibility):
  {"event": "run_id",   "run_id": "..."}
  {"event": "started",  "doc_count": N, "run_id": "..."}
  {"event": "embedded", "doc_count": N, "slug": "..."}   — one per document
  {"event": "done",     "doc_count": N, "run_id": "..."}
  {"event": "error",    "message": "..."}
"""

from __future__ import annotations

import json
import math
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import func, select

from app.models import PipelineRun
from app.schemas.pipeline import CostEstimate, PipelineRunList, PipelineRunSummary
from core.chunking import chunk_document
from core.vault_db import finish_pipeline_run, get_docs, start_pipeline_run


async def list_runs(session: AsyncSession, page: int, page_size: int) -> PipelineRunList:
    total: int = (
        await session.execute(select(func.count()).select_from(PipelineRun))
    ).scalar_one()

    offset = (page - 1) * page_size
    rows = (
        await session.execute(
            select(PipelineRun)
            .order_by(PipelineRun.started_at.desc())
            .offset(offset)
            .limit(page_size)
        )
    ).scalars().all()

    return PipelineRunList(
        items=[summarise(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, math.ceil(total / page_size)),
    )


async def get_run(session: AsyncSession, run_id: str) -> PipelineRun:
    try:
        uid = UUID(run_id)
    except ValueError:
        raise ValueError(f"Invalid run_id format: {run_id!r}")
    run = await session.get(PipelineRun, uid)
    if run is None:
        raise LookupError(f"Run '{run_id}' not found")
    return run


def compute_cost_estimate(settings) -> CostEstimate:
    docs = get_docs(settings.database_url)
    all_chunks = [
        c
        for doc in docs
        for c in chunk_document(doc.slug, doc.content)
        if c["word_count"] >= 10
    ]
    token_count = sum(int(c["word_count"] * 1.3) for c in all_chunks)
    estimated_cost_usd = round((token_count / 1_000_000) * 0.02, 6)
    return CostEstimate(
        doc_count=len(docs),
        chunk_count=len(all_chunks),
        token_count=token_count,
        estimated_cost_usd=estimated_cost_usd,
        model=settings.embedding_model,
    )


async def pipeline_event_stream(settings):
    """Async generator: ingests all vault documents via LightRAG, yields SSE events.

    Runs entirely in FastAPI's event loop — no background thread needed because
    LightRAG ingestion is fully async.  Sync vault_db helpers (get_docs,
    start_pipeline_run, finish_pipeline_run) are fast DB operations that are
    acceptable to call directly from async context.
    """
    from core.ingestion_service import ingest_document

    docs = get_docs(settings.database_url)
    doc_ids = [str(d.id) for d in docs]
    run_id = start_pipeline_run(
        settings.database_url,
        doc_ids=doc_ids,
        model=settings.embedding_model,
        triggered_by="ui",
    )

    yield f"data: {json.dumps({'event': 'run_id', 'run_id': run_id})}\n\n"
    yield f"data: {json.dumps({'event': 'started', 'doc_count': len(docs), 'run_id': run_id})}\n\n"

    ingested = 0
    try:
        for doc in docs:
            await ingest_document(str(doc.id), settings)
            ingested += 1
            yield f"data: {json.dumps({'event': 'embedded', 'doc_count': ingested, 'slug': doc.slug})}\n\n"

        # chunk_count stores number of docs ingested — actual LightRAG chunk count
        # is not surfaced by ainsert.  token_count / cost_usd are not available
        # from LightRAG ingestion; the run history UI shows None for those fields.
        finish_pipeline_run(
            settings.database_url,
            run_id=run_id,
            status="success",
            chunk_count=ingested,
        )
        yield f"data: {json.dumps({'event': 'done', 'doc_count': ingested, 'run_id': run_id})}\n\n"

    except Exception as exc:
        finish_pipeline_run(
            settings.database_url,
            run_id=run_id,
            status="failed",
            error=str(exc),
        )
        yield f"data: {json.dumps({'event': 'error', 'message': str(exc)})}\n\n"


# ── helpers ────────────────────────────────────────────────────────────────────

def summarise(run: PipelineRun) -> PipelineRunSummary:
    return PipelineRunSummary(
        run_id=str(run.id),
        status=run.status,
        triggered_by=run.triggered_by or "unknown",
        chunk_count=run.chunk_count,
        token_count=run.token_count,
        cost_usd=run.cost_usd,
        model=run.model,
        started_at=run.started_at,
        finished_at=run.finished_at,
        error=run.error,
    )
