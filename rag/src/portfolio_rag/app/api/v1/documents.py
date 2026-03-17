"""
Documents Router
================

CRUD endpoints for corpus documents + reindex trigger + file upload/ingestion.
Business logic lives in portfolio_rag.domain.services.document.

Prefix: /documents (mounted under /api/v1)

Route ordering: fixed-path routes MUST be registered before parametric {slug}
routes so FastAPI doesn't swallow them.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from portfolio_rag.app.core.db import get_db_conn
from portfolio_rag.domain.models.document import (
    CorpusDocCreate,
    CorpusDocDetail,
    CorpusDocUpdate,
    DEFAULT_CORPUS_ID,
    DocumentStatusResponse,
    DuplicateCheckRequest,
    DuplicateCheckResponse,
    PaginatedDocs,
)
from portfolio_rag.domain.services import document as svc
from portfolio_rag.domain.services import job_queue
from portfolio_rag.infrastructure.storage import get_storage_backend

router = APIRouter(prefix="/documents", tags=["documents"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]


# ── List / Create ──────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedDocs)
async def list_documents(
    session: DBSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
):
    return await svc.list_documents(session, page, page_size)


@router.post("", response_model=CorpusDocDetail, status_code=201)
async def create_document(data: CorpusDocCreate, session: DBSession):
    try:
        doc = await svc.create_document(session, data)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return _detail(doc)


# ── Fixed-path routes (must come before /{slug}) ──────────────────────────────

@router.post("/check-duplicates", response_model=DuplicateCheckResponse)
async def check_duplicates_endpoint(body: DuplicateCheckRequest, session: DBSession):
    return await svc.check_duplicates(session, body.corpus_id, body.files)


@router.post("/upload", status_code=201)
async def upload_document(
    session: DBSession,
    file: UploadFile = File(...),
    corpus_id: str = Form(DEFAULT_CORPUS_ID),
    file_hash: str = Form(...),
):
    import hashlib

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
    # Make slug unique if needed
    base_slug = slug
    counter = 1
    while True:
        try:
            doc = await svc.create_uploaded_document(
                session,
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
        {"document_id": str(doc.id), "corpus_id": corpus_id},
    )
    await session.commit()
    return {"id": str(doc.id), "slug": doc.slug, "title": doc.title}



# ── Parametric /{slug} routes ──────────────────────────────────────────────────

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


@router.delete("/{slug}", status_code=204)
async def delete_document(slug: str, session: DBSession):
    try:
        await svc.delete_document(session, slug)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── Parametric /{doc_id}/... routes ───────────────────────────────────────────

@router.get("/{doc_id}/status", response_model=DocumentStatusResponse)
async def get_document_status(doc_id: str, session: DBSession):
    try:
        doc = await svc.get_document_by_id(session, doc_id)
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
async def reingest_document(doc_id: str, session: DBSession):
    try:
        doc = await svc.get_document_by_id(session, doc_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Reset status
    doc.doc_metadata = {**(doc.doc_metadata or {}), "lightrag_status": "pending", "error": None}
    session.add(doc)
    await session.commit()

    await job_queue.enqueue(
        session, "reingest_document",
        {"document_id": doc_id, "corpus_id": doc.corpus_id or "portfolio_vault"},
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
