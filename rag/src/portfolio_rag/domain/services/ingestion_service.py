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

from portfolio_rag.domain.services.lightrag_service import CORPUS_ID
from portfolio_rag.domain.services import lightrag_service
from portfolio_rag.infrastructure.db.repository import (
    get_doc_by_id,
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

    if file_data is not None:
        await _attach_file(doc, file_data, settings)

    text = _extract_text(doc)
    if not text:
        raise ValueError(f"No text content found for document {doc.slug!r} ({doc_id})")

    try:
        await lightrag_service.ingest(CORPUS_ID, text, doc_id, settings)
        update_doc_lightrag_status(settings.database_url, doc_id, "ready")
    except Exception:
        update_doc_lightrag_status(settings.database_url, doc_id, "failed")
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


def _extract_text(doc) -> str:
    """Return the plain text for a Document.

    Prefers the DB-stored extracted_text field; falls back to reading a file
    path stored in the file_path column, then the legacy doc_metadata JSONB.
    """
    if doc.extracted_text:
        return doc.extracted_text

    if doc.file_path:
        from pathlib import Path
        return Path(doc.file_path).read_text(encoding="utf-8")

    file_path: str | None = (doc.doc_metadata or {}).get("file_path")
    if file_path:
        from pathlib import Path
        return Path(file_path).read_text(encoding="utf-8")

    return ""
