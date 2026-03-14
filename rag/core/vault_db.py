"""
Sync SQLModel Helpers for Scripts
===================================

Provides:
  - get_docs()             — fetch VaultDocument rows
  - start_pipeline_run()   — insert a PipelineRun(status="running")
  - finish_pipeline_run()  — update a PipelineRun to final status

Creates a new engine per call (acceptable for short-lived scripts).
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import create_engine
from sqlmodel import Session, select

from app.models import PipelineRun, VaultDocument


def _get_engine(database_url: str):
    return create_engine(database_url)


def get_docs(database_url: str, doc_type: str | None = None) -> list[VaultDocument]:
    """Return all vault documents, optionally filtered by type."""
    engine = _get_engine(database_url)
    with Session(engine) as session:
        stmt = select(VaultDocument)
        if doc_type:
            stmt = stmt.where(VaultDocument.type == doc_type)
        stmt = stmt.order_by(VaultDocument.created_at)
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
