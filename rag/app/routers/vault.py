"""
Vault Management Router
========================

CRUD endpoints for vault documents + reindex trigger.
Business logic lives in app.services.vault.

Prefix: /vault (mounted under /api/v1)
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_db_conn
from app.schemas.vault import (
    PaginatedDocs,
    ReindexResponse,
    ReindexStatus,
    VaultDocCreate,
    VaultDocDetail,
    VaultDocUpdate,
)
from app.services import vault as svc
from core.indexer import index_all_docs
from core.vault_db import get_docs, start_pipeline_run

router = APIRouter(prefix="/vault", tags=["vault"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]


@router.get("/documents", response_model=PaginatedDocs)
async def list_documents(
    session: DBSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    return await svc.list_documents(session, page, page_size)


@router.get("/documents/{slug}", response_model=VaultDocDetail)
async def get_document(slug: str, session: DBSession):
    try:
        doc = await svc.get_document(session, slug)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _detail(doc)


@router.put("/documents/{slug}", response_model=VaultDocDetail)
async def update_document(slug: str, patch: VaultDocUpdate, session: DBSession):
    try:
        doc = await svc.update_document(session, slug, patch)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _detail(doc)


@router.post("/documents", response_model=VaultDocDetail, status_code=201)
async def create_document(data: VaultDocCreate, session: DBSession):
    try:
        doc = await svc.create_document(session, data)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return _detail(doc)


@router.delete("/documents/{slug}", status_code=204)
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

def _detail(doc) -> VaultDocDetail:
    return VaultDocDetail(
        id=str(doc.id),
        slug=doc.slug,
        type=doc.type,
        title=doc.title,
        updated_at=doc.updated_at,
        content=doc.content,
    )
