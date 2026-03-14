"""
Pipeline Service
================

Business logic for pipeline run listing, cost estimation, and SSE streaming.
Raises ValueError (bad input) or LookupError (not found) — routers
map these to 400/404 HTTP responses.
"""

from __future__ import annotations

import json
import math
import queue
import threading
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import func, select

from app.models import PipelineRun
from app.schemas.pipeline import CostEstimate, PipelineRunList, PipelineRunSummary
from core.chunking import chunk_document
from core.indexer import index_all_docs
from core.vault_db import get_docs, start_pipeline_run


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
    """Async generator that runs the pipeline in a thread and yields SSE events."""
    import asyncio

    docs = get_docs(settings.database_url)
    doc_ids = [str(d.id) for d in docs]
    run_id = start_pipeline_run(
        settings.database_url,
        doc_ids=doc_ids,
        model=settings.embedding_model,
        triggered_by="ui",
    )

    event_queue: queue.Queue = queue.Queue()

    def progress_cb(event: str, data: dict):
        event_queue.put({"event": event, **data})

    def run_in_thread():
        try:
            index_all_docs(settings, run_id=run_id, progress_cb=progress_cb)
        except Exception as exc:
            event_queue.put({"event": "error", "message": str(exc)})
        finally:
            event_queue.put(None)

    thread = threading.Thread(target=run_in_thread, daemon=True)
    thread.start()

    loop = asyncio.get_running_loop()
    yield f"data: {json.dumps({'event': 'run_id', 'run_id': run_id})}\n\n"
    while True:
        item = await loop.run_in_executor(None, event_queue.get)
        if item is None:
            break
        yield f"data: {json.dumps(item)}\n\n"


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
