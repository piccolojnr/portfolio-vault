"""PipelineRun SQLModel table."""

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Column, Field, SQLModel

from app.models.base import utcnow


class PipelineRun(SQLModel, table=True):
    __tablename__ = "pipeline_runs"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    triggered_by: str = "manual"
    status: str = "running"
    doc_ids: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False),
    )
    chunk_count: Optional[int] = None
    token_count: Optional[int] = None
    cost_usd: Optional[float] = None
    model: Optional[str] = None
    started_at: datetime = Field(default_factory=utcnow)
    finished_at: Optional[datetime] = None
    error: Optional[str] = None
