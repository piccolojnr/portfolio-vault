"""
Documents Router
================

CRUD endpoints for corpus documents + reindex trigger.
Business logic lives in portfolio_rag.domain.services.vault.

Prefix: /documents (mounted under /api/v1)
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from portfolio_rag.app.core.config import get_settings
from portfolio_rag.app.core.db import get_db_conn
from portfolio_rag.domain.models.document import (
    CorpusDocCreate,
    CorpusDocDetail,
    CorpusDocUpdate,
    PaginatedDocs,
    ReindexResponse,
    ReindexStatus,
)
from portfolio_rag.domain.services import document as svc
from portfolio_rag.domain.services.indexer import index_all_docs
from portfolio_rag.infrastructure.db.repository import get_docs, start_pipeline_run

router = APIRouter(prefix="/documents", tags=["documents"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]


@router.get("", response_model=PaginatedDocs)
async def list_documents(
    session: DBSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    return await svc.list_documents(session, page, page_size)


@router.get("/{slug}", response_model=CorpusDocDetail)
async def get_document(slug: str, session: DBSession):
    try:
        doc = await svc.get_document(session, slug)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _detail(doc)


@router.put("/{slug}", response_model=CorpusDocDetail)
async def update_document(slug: str, patch: CorpusDocUpdate, session: DBSession):
    try:
        doc = await svc.update_document(session, slug, patch)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _detail(doc)


@router.post("", response_model=CorpusDocDetail, status_code=201)
async def create_document(data: CorpusDocCreate, session: DBSession):
    try:
        doc = await svc.create_document(session, data)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return _detail(doc)


@router.delete("/{slug}", status_code=204)
async def delete_document(slug: str, session: DBSession):
    try:
        await svc.delete_document(session, slug)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/reindex", response_model=ReindexResponse, status_code=202)
async def trigger_reindex(background_tasks: BackgroundTasks):
    settings = get_settings()
    docs = get_docs(settings.database_url)
    doc_ids = [str(d.id) for d in docs]
    run_id = start_pipeline_run(
        settings.database_url,
        doc_ids=doc_ids,
        model=settings.embedding_model,
        triggered_by="api",
    )
    background_tasks.add_task(index_all_docs, settings, run_id=run_id)
    return ReindexResponse(run_id=run_id, status="running")


@router.get("/reindex/{run_id}", response_model=ReindexStatus)
async def get_reindex_status(run_id: str, session: DBSession):
    try:
        run = await svc.get_run_status(session, run_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return ReindexStatus(
        run_id=str(run.id),
        status=run.status,
        chunk_count=run.chunk_count,
        started_at=run.started_at,
        finished_at=run.finished_at,
        error=run.error,
    )


# ── helpers ────────────────────────────────────────────────────────────────────

def _detail(doc) -> CorpusDocDetail:
    return CorpusDocDetail(
        id=str(doc.id),
        corpus_id=doc.corpus_id,
        slug=doc.slug,
        type=doc.type,
        title=doc.title,
        updated_at=doc.updated_at,
        extracted_text=doc.extracted_text,
    )
