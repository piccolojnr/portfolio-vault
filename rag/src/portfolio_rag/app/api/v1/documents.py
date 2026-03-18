"""
Documents Router
================

CRUD endpoints for corpus documents + reindex trigger + file upload/ingestion.
All endpoints require authentication; data is scoped to the caller's org.

Prefix: /documents (mounted under /api/v1)

Route ordering: fixed-path routes MUST be registered before parametric {slug}
routes so FastAPI doesn't swallow them.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from portfolio_rag.app.core.db import get_db_conn
from portfolio_rag.app.core.dependencies import get_current_user
from portfolio_rag.domain.models.document import (
    CorpusDocCreate,
    CorpusDocDetail,
    CorpusDocUpdate,
    DocumentStatusResponse,
    DuplicateCheckRequest,
    DuplicateCheckResponse,
    PaginatedDocs,
)
from portfolio_rag.domain.services import job_queue, org_service
from portfolio_rag.infrastructure.db.scoped_repository import DocumentRepository
from portfolio_rag.infrastructure.storage import get_storage_backend
from portfolio_rag.domain.services import document as svc

router = APIRouter(prefix="/documents", tags=["documents"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]


def _repo(session: AsyncSession, current_user: dict) -> DocumentRepository:
    return DocumentRepository(session, UUID(current_user["org_id"]))


# ── List / Create ──────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedDocs)
async def list_documents(
    session: DBSession,
    current_user: dict = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
):
    return await _repo(session, current_user).list(page, page_size)


@router.post("", response_model=CorpusDocDetail, status_code=201)
async def create_document(
    data: CorpusDocCreate,
    session: DBSession,
    current_user: dict = Depends(get_current_user),
):
    try:
        doc = await _repo(session, current_user).create(data)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return _detail(doc)


# ── Fixed-path routes (must come before /{slug}) ──────────────────────────────

async def _get_active_corpus_key(session: AsyncSession, org_id: UUID) -> str:
    """Resolve the org's active corpus_key. Raises 400 if none is set."""
    try:
        corpus = await org_service.get_active_corpus(session, org_id)
        return corpus.corpus_key
    except LookupError:
        raise HTTPException(
            status_code=400,
            detail="No active knowledge base. Set one in Organisation Settings.",
        )


@router.post("/check-duplicates", response_model=DuplicateCheckResponse)
async def check_duplicates_endpoint(
    body: DuplicateCheckRequest,
    session: DBSession,
    current_user: dict = Depends(get_current_user),
):
    org_id = UUID(current_user["org_id"])
    corpus_key = await _get_active_corpus_key(session, org_id)
    return await _repo(session, current_user).check_duplicates(corpus_key, body.files)


@router.post("/upload", status_code=201)
async def upload_document(
    session: DBSession,
    current_user: dict = Depends(get_current_user),
    file: UploadFile = File(...),
    file_hash: str = Form(...),
):
    import hashlib

    org_id = UUID(current_user["org_id"])
    corpus_id = await _get_active_corpus_key(session, org_id)

    data = await file.read()

    # Verify hash matches client-supplied value
    actual_hash = hashlib.sha256(data).hexdigest()
    if actual_hash != file_hash:
        raise HTTPException(status_code=400, detail="file_hash mismatch")

    # Store file
    storage = get_storage_backend()
    filename = file.filename or "upload.txt"
    path = f"{corpus_id}/{file_hash[:12]}/{filename}"
    stored_path = await storage.upload(path, data, file.content_type or "application/octet-stream")

    # Decode text content immediately for text/markdown files
    mimetype = file.content_type or "text/plain"
    extracted_text = ""
    if mimetype in svc.SUPPORTED_MIMETYPES:
        try:
            extracted_text = data.decode("utf-8")
        except UnicodeDecodeError:
            try:
                import chardet
                detected = chardet.detect(data)
                enc = detected.get("encoding") or "utf-8"
                extracted_text = data.decode(enc, errors="replace")
            except Exception:
                extracted_text = data.decode("utf-8", errors="replace")

    # Derive slug from filename
    slug = svc._filename_to_slug(filename)
    # Make slug unique within org if needed
    base_slug = slug
    counter = 1
    repo = _repo(session, current_user)
    while True:
        try:
            doc = await repo.create_uploaded(
                corpus_id=corpus_id,
                slug=slug,
                title=filename,
                mimetype=mimetype,
                file_hash=file_hash,
                file_path=stored_path,
                file_size=len(data),
                extracted_text=extracted_text,
            )
            break
        except ValueError:
            slug = f"{base_slug}-{counter}"
            counter += 1

    await job_queue.enqueue(
        session, "ingest_document",
        {
            "document_id": str(doc.id),
            "corpus_id": corpus_id,
            "org_id": str(current_user["org_id"]),
        },
        org_id=UUID(current_user["org_id"]),
    )
    await session.commit()
    return {"id": str(doc.id), "slug": doc.slug, "title": doc.title}


# ── Parametric /{slug} routes ──────────────────────────────────────────────────

@router.get("/{slug}", response_model=CorpusDocDetail)
async def get_document(
    slug: str,
    session: DBSession,
    current_user: dict = Depends(get_current_user),
):
    try:
        doc = await _repo(session, current_user).get_by_slug(slug)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _detail(doc)


@router.put("/{slug}", response_model=CorpusDocDetail)
async def update_document(
    slug: str,
    patch: CorpusDocUpdate,
    session: DBSession,
    current_user: dict = Depends(get_current_user),
):
    try:
        doc = await _repo(session, current_user).update(slug, patch)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _detail(doc)


@router.delete("/{slug}", status_code=204)
async def delete_document(
    slug: str,
    session: DBSession,
    current_user: dict = Depends(get_current_user),
):
    try:
        await _repo(session, current_user).delete(slug)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── Parametric /{doc_id}/... routes ───────────────────────────────────────────

@router.get("/{doc_id}/status", response_model=DocumentStatusResponse)
async def get_document_status(
    doc_id: str,
    session: DBSession,
    current_user: dict = Depends(get_current_user),
):
    try:
        doc = await _repo(session, current_user).get_by_id(doc_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    meta = doc.doc_metadata or {}
    return DocumentStatusResponse(
        id=str(doc.id),
        slug=doc.slug,
        status=meta.get("lightrag_status", "pending"),
        error=meta.get("error"),
    )


@router.post("/{doc_id}/reingest", status_code=202)
async def reingest_document(
    doc_id: str,
    session: DBSession,
    current_user: dict = Depends(get_current_user),
):
    try:
        doc = await _repo(session, current_user).get_by_id(doc_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Reset status
    doc.doc_metadata = {**(doc.doc_metadata or {}), "lightrag_status": "pending", "error": None}
    session.add(doc)
    await session.commit()

    org_id = UUID(current_user["org_id"])
    corpus_id = doc.corpus_id or await _get_active_corpus_key(session, org_id)
    await job_queue.enqueue(
        session, "reingest_document",
        {
            "document_id": doc_id,
            "corpus_id": corpus_id,
            "org_id": str(current_user["org_id"]),
        },
        org_id=org_id,
    )
    await session.commit()
    return {"status": "queued"}


# ── Response helpers ───────────────────────────────────────────────────────────

def _detail(doc) -> CorpusDocDetail:
    return CorpusDocDetail(
        id=str(doc.id),
        corpus_id=doc.corpus_id,
        slug=doc.slug,
        type=doc.type,
        title=doc.title,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        extracted_text=doc.extracted_text,
        lightrag_status=(doc.doc_metadata or {}).get("lightrag_status"),
        source_type=getattr(doc, "source_type", "text") or "text",
        file_size=getattr(doc, "file_size", None),
        mimetype=getattr(doc, "mimetype", None),
    )
