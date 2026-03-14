"""
Pipeline Control Router
========================

Endpoints for running the chunk/embed pipeline with SSE progress streaming
and viewing run history.

Prefix: /pipeline (mounted under /api/v1)
"""

from __future__ import annotations

import json
import math
import queue
import threading
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select, func

from app.config import get_settings
from app.db import get_db_conn
from app.models import PipelineRun
from app.schemas import CostEstimate, PipelineRunList, PipelineRunSummary
from portfolio_vault.chunking import chunk_document
from portfolio_vault.indexer import index_all_docs
from portfolio_vault.vault_db import get_docs, start_pipeline_run

router = APIRouter(prefix="/pipeline", tags=["pipeline"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]


@router.get("/runs", response_model=PipelineRunList)
async def list_runs(
    session: DBSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
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
        items=[_summarise(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, math.ceil(total / page_size)),
    )


@router.get("/runs/{run_id}", response_model=PipelineRunSummary)
async def get_run(run_id: str, session: DBSession):
    try:
        uid = UUID(run_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid run_id format")

    run = await session.get(PipelineRun, uid)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
    return _summarise(run)


@router.get("/cost-estimate", response_model=CostEstimate)
async def cost_estimate():
    settings = get_settings()
    docs = get_docs(settings.database_url)

    all_chunks = [
        c
        for doc in docs
        for c in chunk_document(doc.slug, doc.content)
        if c["word_count"] >= 10
    ]

    # Rough token estimate: words * 1.3 (no extra dependency needed)
    token_count = sum(int(c["word_count"] * 1.3) for c in all_chunks)

    # text-embedding-3-small: $0.02 per 1M tokens
    estimated_cost_usd = round((token_count / 1_000_000) * 0.02, 6)

    return CostEstimate(
        doc_count=len(docs),
        chunk_count=len(all_chunks),
        token_count=token_count,
        estimated_cost_usd=estimated_cost_usd,
        model=settings.embedding_model,
    )


@router.post("/run")
async def run_pipeline():
    """Start the full pipeline and stream SSE progress events."""
    settings = get_settings()

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
            event_queue.put(None)  # sentinel

    thread = threading.Thread(target=run_in_thread, daemon=True)
    thread.start()

    async def event_stream():
        import asyncio
        loop = asyncio.get_event_loop()
        # Emit run_id immediately so client can poll fallback
        yield f"data: {json.dumps({'event': 'run_id', 'run_id': run_id})}\n\n"
        while True:
            item = await loop.run_in_executor(None, event_queue.get)
            if item is None:
                break
            yield f"data: {json.dumps(item)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── helpers ────────────────────────────────────────────────────────────────────

def _summarise(run: PipelineRun) -> PipelineRunSummary:
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
