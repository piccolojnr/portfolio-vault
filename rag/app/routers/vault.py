"""
Vault Management Router
========================

CRUD endpoints for vault documents + reindex trigger.

Prefix: /vault (mounted under /api/v1)
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

import math

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import func, select

from app.config import get_settings
from app.db import get_db_conn
from app.models import PipelineRun, VaultDocument
from app.schemas import (
    PaginatedDocs,
    ReindexResponse,
    ReindexStatus,
    VaultDocCreate,
    VaultDocDetail,
    VaultDocSummary,
    VaultDocUpdate,
)
from portfolio_vault.indexer import index_all_docs
from portfolio_vault.vault_db import get_docs, start_pipeline_run

router = APIRouter(prefix="/vault", tags=["vault"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]


@router.get("/documents", response_model=PaginatedDocs)
async def list_documents(
    session: DBSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    total: int = (
        await session.execute(select(func.count()).select_from(VaultDocument))
    ).scalar_one()

    offset = (page - 1) * page_size
    rows = (
        await session.execute(
            select(VaultDocument)
            .order_by(VaultDocument.type, VaultDocument.slug)
            .offset(offset)
            .limit(page_size)
        )
    ).scalars().all()

    return PaginatedDocs(
        items=[
            VaultDocSummary(
                id=str(d.id),
                slug=d.slug,
                type=d.type,
                title=d.title,
                updated_at=d.updated_at,
            )
            for d in rows
        ],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, math.ceil(total / page_size)),
    )


@router.get("/documents/{slug}", response_model=VaultDocDetail)
async def get_document(slug: str, session: DBSession):
    result = await session.execute(
        select(VaultDocument).where(VaultDocument.slug == slug)
    )
    doc = result.scalars().first()
    if doc is None:
        raise HTTPException(status_code=404, detail=f"Document '{slug}' not found")
    return VaultDocDetail(
        id=str(doc.id),
        slug=doc.slug,
        type=doc.type,
        title=doc.title,
        updated_at=doc.updated_at,
        content=doc.content,
    )


@router.put("/documents/{slug}", response_model=VaultDocDetail)
async def update_document(slug: str, patch: VaultDocUpdate, session: DBSession):
    result = await session.execute(
        select(VaultDocument).where(VaultDocument.slug == slug)
    )
    doc = result.scalars().first()
    if doc is None:
        raise HTTPException(status_code=404, detail=f"Document '{slug}' not found")

    if patch.title is not None:
        doc.title = patch.title
    if patch.content is not None:
        doc.content = patch.content
    doc.updated_at = datetime.now(timezone.utc)

    session.add(doc)
    await session.commit()
    await session.refresh(doc)

    return VaultDocDetail(
        id=str(doc.id),
        slug=doc.slug,
        type=doc.type,
        title=doc.title,
        updated_at=doc.updated_at,
        content=doc.content,
    )


@router.post("/documents", response_model=VaultDocDetail, status_code=201)
async def create_document(data: VaultDocCreate, session: DBSession):
    existing = (await session.execute(
        select(VaultDocument).where(VaultDocument.slug == data.slug)
    )).scalars().first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Slug '{data.slug}' already exists")

    doc = VaultDocument(
        type=data.type,
        slug=data.slug,
        title=data.title,
        content=data.content,
    )
    session.add(doc)
    await session.commit()
    await session.refresh(doc)
    return VaultDocDetail(
        id=str(doc.id), slug=doc.slug, type=doc.type,
        title=doc.title, updated_at=doc.updated_at, content=doc.content,
    )


@router.delete("/documents/{slug}", status_code=204)
async def delete_document(slug: str, session: DBSession):
    result = await session.execute(
        select(VaultDocument).where(VaultDocument.slug == slug)
    )
    doc = result.scalars().first()
    if doc is None:
        raise HTTPException(status_code=404, detail=f"Document '{slug}' not found")
    await session.delete(doc)
    await session.commit()


@router.post("/reindex", response_model=ReindexResponse, status_code=202)
async def trigger_reindex(background_tasks: BackgroundTasks):
    settings = get_settings()

    # Create the pipeline run record synchronously via the sync helper
    docs = get_docs(settings.database_url)
    doc_ids = [str(d.id) for d in docs]
    run_id = start_pipeline_run(
        settings.database_url,
        doc_ids=doc_ids,
        model=settings.embedding_model,
        triggered_by="api",
    )

    # index_all_docs is sync — BackgroundTasks runs it in a thread pool
    background_tasks.add_task(index_all_docs, settings, run_id=run_id)

    return ReindexResponse(run_id=run_id, status="running")


@router.get("/reindex/{run_id}", response_model=ReindexStatus)
async def get_reindex_status(run_id: str, session: DBSession):
    try:
        uid = UUID(run_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid run_id format")

    run = await session.get(PipelineRun, uid)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Pipeline run '{run_id}' not found")

    return ReindexStatus(
        run_id=str(run.id),
        status=run.status,
        chunk_count=run.chunk_count,
        started_at=run.started_at,
        finished_at=run.finished_at,
        error=run.error,
    )
