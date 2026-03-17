"""
Sync SQLModel Helpers for Scripts
===================================

Provides:
  - get_docs()               — fetch Document rows
  - start_pipeline_run()     — insert a PipelineRun(status="running")
  - finish_pipeline_run()    — update a PipelineRun to final status
  - get_doc_by_id()          — fetch single Document by UUID
  - update_doc_lightrag_status() — write lightrag_status to doc_metadata JSONB
  - update_doc_file_meta()   — write file_path/file_size/file_hash to columns

Creates a new engine per call (acceptable for short-lived scripts).
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import create_engine
from sqlmodel import Session, select

from portfolio_rag.infrastructure.db import Document, PipelineRun


def _get_engine(database_url: str):
    return create_engine(database_url)


def get_docs(database_url: str, doc_type: str | None = None) -> list[Document]:
    """Return all documents, optionally filtered by type."""
    engine = _get_engine(database_url)
    with Session(engine) as session:
        stmt = select(Document)
        if doc_type:
            stmt = stmt.where(Document.type == doc_type)
        stmt = stmt.order_by(Document.created_at)
        return session.exec(stmt).all()


def start_pipeline_run(
    database_url: str,
    *,
    doc_ids: list[str],
    model: str | None = None,
    triggered_by: str = "manual",
) -> str:
    """Insert a PipelineRun with status='running'. Returns the run id as a string."""
    engine = _get_engine(database_url)
    run = PipelineRun(
        triggered_by=triggered_by,
        status="running",
        doc_ids=doc_ids,
        model=model,
    )
    with Session(engine) as session:
        session.add(run)
        session.commit()
        session.refresh(run)
        return str(run.id)


def get_doc_by_id(database_url: str, doc_id: str) -> Document | None:
    """Fetch a single Document by its UUID primary key."""
    engine = _get_engine(database_url)
    with Session(engine) as session:
        return session.get(Document, UUID(doc_id))


def save_extracted_text(database_url: str, doc_id: str, text: str) -> None:
    """Persist extracted plain text to the document's extracted_text column."""
    engine = _get_engine(database_url)
    with Session(engine) as session:
        doc = session.get(Document, UUID(doc_id))
        if doc is None:
            return
        doc.extracted_text = text
        session.add(doc)
        session.commit()


def update_doc_metadata(database_url: str, doc_id: str, updates: dict) -> None:
    """Merge *updates* into the document's doc_metadata JSONB column.

    Uses full dict reassignment so SQLAlchemy detects the column as dirty.
    """
    engine = _get_engine(database_url)
    with Session(engine) as session:
        doc = session.get(Document, UUID(doc_id))
        if doc is None:
            return
        doc.doc_metadata = {**(doc.doc_metadata or {}), **updates}
        session.add(doc)
        session.commit()


def update_doc_lightrag_status(database_url: str, doc_id: str, status: str) -> None:
    """Write lightrag_status into the document's doc_metadata JSONB column.

    Important: reassigns the whole dict (not a sub-key mutation) so that
    SQLAlchemy detects the column as dirty and persists the change.  A bare
    doc.doc_metadata["key"] = value would be silently dropped because
    SQLAlchemy tracks object identity, not deep dict mutations.
    """
    engine = _get_engine(database_url)
    with Session(engine) as session:
        doc = session.get(Document, UUID(doc_id))
        if doc is None:
            return
        doc.doc_metadata = {**(doc.doc_metadata or {}), "lightrag_status": status}
        session.add(doc)
        session.commit()


def update_doc_file_meta(
    database_url: str,
    doc_id: str,
    *,
    file_path: str,
    file_size: int,
    file_hash: str,
) -> None:
    """Write file_path, file_size, and file_hash to the document's columns."""
    engine = _get_engine(database_url)
    with Session(engine) as session:
        doc = session.get(Document, UUID(doc_id))
        if doc is None:
            return
        doc.file_path = file_path
        doc.file_size = file_size
        doc.file_hash = file_hash
        session.add(doc)
        session.commit()


def finish_pipeline_run(
    database_url: str,
    *,
    run_id: str,
    status: str,
    chunk_count: int | None = None,
    token_count: int | None = None,
    cost_usd: float | None = None,
    error: str | None = None,
) -> None:
    """Update a PipelineRun to its final status."""
    engine = _get_engine(database_url)
    with Session(engine) as session:
        run = session.get(PipelineRun, UUID(run_id))
        if run is None:
            raise ValueError(f"PipelineRun {run_id} not found")
        run.status = status
        run.finished_at = datetime.now(timezone.utc)
        if chunk_count is not None:
            run.chunk_count = chunk_count
        if token_count is not None:
            run.token_count = token_count
        if cost_usd is not None:
            run.cost_usd = cost_usd
        if error is not None:
            run.error = error
        session.add(run)
        session.commit()
