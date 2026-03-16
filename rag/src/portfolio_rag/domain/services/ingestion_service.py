"""
Ingestion Service
=================

Document-level ingestion for the LightRAG pipeline.

Fetches a VaultDocument from the database, extracts its plain text, delegates
to lightrag_service.ingest(), and writes the result status back to the
document's doc_metadata JSONB column.

Text extraction rules (in order):
  1. doc.content if non-empty — the primary store for all vault markdown.
  2. doc.doc_metadata["file_path"] — fallback for documents whose content has
     not been synced to the DB (e.g., large binary-adjacent files).

This service is the single call-site for LightRAG ingestion.  The pipeline
SSE endpoint and any future job-queue workers call ingest_document(); they
do not interact with lightrag_service directly.
"""

from __future__ import annotations

from portfolio_rag.domain.services.lightrag_service import CORPUS_ID
from portfolio_rag.domain.services import lightrag_service
from portfolio_rag.infrastructure.db.repository import get_doc_by_id, update_doc_lightrag_status


async def ingest_document(doc_id: str, settings) -> None:
    """Ingest a single VaultDocument into the LightRAG corpus.

    Updates doc.doc_metadata["lightrag_status"] to "ready" on success or
    "failed" on error.  Raises on unexpected errors so the caller can record
    the failure in the pipeline run audit row.
    """
    doc = get_doc_by_id(settings.database_url, doc_id)
    if doc is None:
        raise LookupError(f"VaultDocument {doc_id!r} not found")

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

def _extract_text(doc) -> str:
    """Return the plain text for a VaultDocument.

    Prefers the DB-stored content field; falls back to reading a file path
    stored in doc_metadata if content is empty.
    """
    if doc.content:
        return doc.content

    file_path: str | None = (doc.doc_metadata or {}).get("file_path")
    if file_path:
        from pathlib import Path
        return Path(file_path).read_text(encoding="utf-8")

    return ""
