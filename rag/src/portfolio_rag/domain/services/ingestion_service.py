"""
Ingestion Service
=================

Document-level ingestion for the LightRAG pipeline.

Fetches a Document from the database, extracts its plain text, delegates
to lightrag_service.ingest(), and writes the result status back to the
document's doc_metadata JSONB column.

Text extraction rules (in order):
  1. doc.extracted_text if non-empty — the primary store for all vault markdown.
  2. doc.file_path column — path to an uploaded file (new column).
  3. doc.doc_metadata["file_path"] — legacy JSONB fallback for older rows.

This service is the single call-site for LightRAG ingestion.  The pipeline
SSE endpoint and any future job-queue workers call ingest_document(); they
do not interact with lightrag_service directly.
"""

from __future__ import annotations

import hashlib
import logging

logger = logging.getLogger(__name__)

from portfolio_rag.domain.services.lightrag_service import CORPUS_ID
from portfolio_rag.domain.services import lightrag_service
from portfolio_rag.infrastructure.db.repository import (
    get_doc_by_id,
    save_extracted_text,
    update_doc_metadata,
    update_doc_lightrag_status,
    update_doc_file_meta,
)


async def ingest_document(
    doc_id: str,
    settings,
    *,
    file_data: bytes | None = None,
) -> None:
    """Ingest a single Document into the LightRAG corpus.

    If file_data is provided, the bytes are stored via the configured
    StorageBackend and file metadata is written to the document's columns
    before text extraction.

    Updates doc.doc_metadata["lightrag_status"] to "ready" on success or
    "failed" on error.  Raises on unexpected errors so the caller can record
    the failure in the pipeline run audit row.
    """
    doc = get_doc_by_id(settings.database_url, doc_id)
    if doc is None:
        raise LookupError(f"Document {doc_id!r} not found")

    # Mark as processing immediately so the UI can distinguish "started" from "queued"
    update_doc_metadata(settings.database_url, doc_id, {"lightrag_status": "processing", "error": None})
    logger.info("[ingest] status=processing slug=%s", doc.slug)

    try:
        if file_data is not None:
            await _attach_file(doc, file_data, settings)

        text, encoding_warning = _extract_text(doc)
        if not text:
            raise ValueError(f"No text content found for document {doc.slug!r} ({doc_id})")

        logger.info("[ingest] extracted %d chars from slug=%s, calling lightrag", len(text), doc.slug)

        # Persist extracted text so the editor is never blank for file-sourced docs
        if not doc.extracted_text:
            save_extracted_text(settings.database_url, doc_id, text)

        extra_meta: dict = {}
        if encoding_warning:
            extra_meta["encoding_warning"] = encoding_warning

        await lightrag_service.ingest(CORPUS_ID, text, doc_id, settings)
        logger.info("[ingest] lightrag done for slug=%s, writing ready status", doc.slug)
        update_doc_metadata(settings.database_url, doc_id, {**extra_meta, "lightrag_status": "ready"})
    except Exception as exc:
        logger.exception("[ingest] error for slug=%s: %s", doc.slug, exc)
        update_doc_metadata(
            settings.database_url, doc_id,
            {"lightrag_status": "failed", "error": str(exc)},
        )
        raise


# ── helpers ───────────────────────────────────────────────────────────────────

async def _attach_file(doc, data: bytes, settings) -> None:
    """Upload file bytes to storage and persist file metadata to the document."""
    from portfolio_rag.infrastructure.storage import get_storage_backend

    storage = get_storage_backend()
    file_hash = hashlib.sha256(data).hexdigest()
    path = f"{doc.slug}/{file_hash[:8]}_{doc.slug}"
    stored_path = await storage.upload(path, data, "application/octet-stream")
    update_doc_file_meta(
        settings.database_url,
        str(doc.id),
        file_path=stored_path,
        file_size=len(data),
        file_hash=file_hash,
    )
    # Refresh in-memory so _extract_text sees the new path
    doc.file_path = stored_path


def _extract_text(doc) -> tuple[str, str | None]:
    """Return (plain_text, encoding_warning_or_None) for a Document.

    Prefers the DB-stored extracted_text field; falls back to reading a file
    path stored in the file_path column, then the legacy doc_metadata JSONB.
    """
    if doc.extracted_text:
        return doc.extracted_text, None

    if doc.file_path:
        return _read_file_bytes(doc.file_path)

    file_path: str | None = (doc.doc_metadata or {}).get("file_path")
    if file_path:
        return _read_file_bytes(file_path)

    return "", None


def _read_file_bytes(path: str) -> tuple[str, str | None]:
    """Read a file with encoding detection.

    Returns (text, warning) where warning is non-None when confidence < 0.7
    or a fallback decode was needed.
    """
    from pathlib import Path

    raw = Path(path).read_bytes()
    try:
        return raw.decode("utf-8"), None
    except UnicodeDecodeError:
        pass
    try:
        import chardet
        detected = chardet.detect(raw)
        enc = detected.get("encoding") or "utf-8"
        conf = float(detected.get("confidence") or 0.0)
        text = raw.decode(enc, errors="replace")
        warning: str | None = None
        if conf < 0.7:
            warning = f"Low-confidence encoding detection: {enc!r} ({conf:.0%}); some characters may be garbled"
        return text, warning
    except Exception:
        return raw.decode("utf-8", errors="replace"), "UTF-8 fallback decode with errors='replace'"
