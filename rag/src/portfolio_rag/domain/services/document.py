"""
Document Service
================

Business logic for corpus document CRUD and reindex status.
Raises ValueError (bad input) or LookupError (not found) — routers
map these to 400/404 HTTP responses.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import func, select

from portfolio_rag.infrastructure.db import Document, PipelineRun
from portfolio_rag.domain.models.document import (
    CorpusDocCreate,
    CorpusDocSummary,
    CorpusDocUpdate,
    PaginatedDocs,
)


async def list_documents(session: AsyncSession, page: int, page_size: int) -> PaginatedDocs:
    total: int = (
        await session.execute(select(func.count()).select_from(Document))
    ).scalar_one()

    offset = (page - 1) * page_size
    rows = (
        await session.execute(
            select(Document)
            .order_by(Document.type, Document.slug)
            .offset(offset)
            .limit(page_size)
        )
    ).scalars().all()

    return PaginatedDocs(
        items=[_doc_summary(d) for d in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, math.ceil(total / page_size)),
    )


async def get_document(session: AsyncSession, slug: str) -> Document:
    doc = (
        await session.execute(select(Document).where(Document.slug == slug))
    ).scalars().first()
    if doc is None:
        raise LookupError(f"Document '{slug}' not found")
    return doc


async def create_document(session: AsyncSession, data: CorpusDocCreate) -> Document:
    existing = (
        await session.execute(select(Document).where(Document.slug == data.slug))
    ).scalars().first()
    if existing:
        raise ValueError(f"Slug '{data.slug}' already exists")

    doc = Document(
        corpus_id=data.corpus_id,
        type=data.type,
        slug=data.slug,
        title=data.title,
        extracted_text=data.extracted_text,
    )
    session.add(doc)
    await session.commit()
    await session.refresh(doc)
    return doc


async def update_document(
    session: AsyncSession, slug: str, patch: CorpusDocUpdate
) -> Document:
    doc = await get_document(session, slug)
    if patch.title is not None:
        doc.title = patch.title
    if patch.extracted_text is not None:
        doc.extracted_text = patch.extracted_text
    if patch.corpus_id is not None:
        doc.corpus_id = patch.corpus_id
    doc.updated_at = datetime.now(timezone.utc)
    session.add(doc)
    await session.commit()
    await session.refresh(doc)
    return doc


async def delete_document(session: AsyncSession, slug: str) -> None:
    doc = await get_document(session, slug)
    await session.delete(doc)
    await session.commit()


async def get_run_status(session: AsyncSession, run_id: str) -> PipelineRun:
    try:
        uid = UUID(run_id)
    except ValueError:
        raise ValueError(f"Invalid run_id format: {run_id!r}")
    run = await session.get(PipelineRun, uid)
    if run is None:
        raise LookupError(f"Pipeline run '{run_id}' not found")
    return run


# ── helpers ────────────────────────────────────────────────────────────────────

def _doc_summary(d: Document) -> CorpusDocSummary:
    return CorpusDocSummary(
        id=str(d.id),
        corpus_id=d.corpus_id,
        slug=d.slug,
        type=d.type,
        title=d.title,
        updated_at=d.updated_at,
    )
