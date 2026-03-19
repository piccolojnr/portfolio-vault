"""
Document Service
================

Business logic for corpus document CRUD and reindex status.
Raises ValueError (bad input) or LookupError (not found) — routers
map these to 400/404 HTTP responses.
"""

from __future__ import annotations

import math
import re
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from sqlalchemy import any_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import func, select

from memra.infrastructure.db import Document, PipelineRun
from memra.domain.models.document import (
    CorpusDocCreate,
    CorpusDocSummary,
    CorpusDocUpdate,
    DuplicateCheckFile,
    DuplicateCheckRequest,
    DuplicateCheckResponse,
    DuplicateCheckResult,
    DocumentStatusResponse,
    PaginatedDocs,
)

SUPPORTED_MIMETYPES = {"text/plain", "text/markdown"}


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
    if patch.type is not None:
        doc.type = patch.type
    doc.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(doc)
    await session.commit()
    await session.refresh(doc)
    return doc


async def delete_document(session: AsyncSession, slug: str) -> None:
    doc = await get_document(session, slug)
    await session.delete(doc)
    await session.commit()


async def check_duplicates(
    session: AsyncSession, corpus_id: str, files: list[DuplicateCheckFile]
) -> DuplicateCheckResponse:
    hashes = [f.hash for f in files]
    rows = (
        await session.execute(
            select(Document).where(
                Document.corpus_id == corpus_id,
                Document.file_hash.in_(hashes),
            )
        )
    ).scalars().all()
    hash_to_title = {r.file_hash: r.title for r in rows if r.file_hash}

    results: list[DuplicateCheckResult] = []
    for f in files:
        if f.mimetype not in SUPPORTED_MIMETYPES:
            results.append(DuplicateCheckResult(filename=f.filename, hash=f.hash, status="unsupported"))
        elif f.hash in hash_to_title:
            results.append(DuplicateCheckResult(
                filename=f.filename, hash=f.hash, status="duplicate",
                existing_title=hash_to_title[f.hash],
            ))
        else:
            results.append(DuplicateCheckResult(filename=f.filename, hash=f.hash, status="new"))
    return DuplicateCheckResponse(results=results)


async def create_uploaded_document(
    session: AsyncSession,
    *,
    corpus_id: str,
    slug: str,
    title: str,
    mimetype: str,
    file_hash: str,
    file_path: str,
    file_size: int,
    extracted_text: str = "",
) -> Document:
    existing = (
        await session.execute(select(Document).where(Document.slug == slug))
    ).scalars().first()
    if existing:
        raise ValueError(f"Slug '{slug}' already exists")

    doc = Document(
        corpus_id=corpus_id,
        type="file",
        slug=slug,
        title=title,
        source_type="file",
        mimetype=mimetype,
        file_hash=file_hash,
        file_path=file_path,
        file_size=file_size,
        extracted_text=extracted_text,
        doc_metadata={"lightrag_status": "pending"},
    )
    session.add(doc)
    await session.commit()
    await session.refresh(doc)
    return doc


async def get_document_by_id(session: AsyncSession, doc_id: str) -> Document:
    try:
        uid = UUID(doc_id)
    except ValueError:
        raise LookupError(f"Invalid document id: {doc_id!r}")
    doc = await session.get(Document, uid)
    if doc is None:
        raise LookupError(f"Document '{doc_id}' not found")
    return doc


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
        created_at=d.created_at,
        updated_at=d.updated_at,
        lightrag_status=(d.doc_metadata or {}).get("lightrag_status"),
        source_type=d.source_type,
        file_size=d.file_size,
        mimetype=d.mimetype,
    )


def _filename_to_slug(filename: str) -> str:
    stem = Path(filename).stem.lower()
    return re.sub(r"[^a-z0-9]+", "-", stem).strip("-") or "upload"
