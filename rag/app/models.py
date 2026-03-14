"""
SQLModel Table Definitions
===========================

Three tables:
  - VaultDocument  — markdown content from the portfolio vault
  - PipelineRun    — audit log for chunking/embedding runs
  - AppSetting     — key-value runtime settings store
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Column, Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class VaultDocument(SQLModel, table=True):
    __tablename__ = "vault_documents"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    type: str
    slug: str = Field(sa_column=Column(sa.String, unique=True, nullable=False))
    title: str = ""
    content: str = ""
    doc_metadata: dict = Field(
        default_factory=dict,
        sa_column=Column("metadata", JSONB, nullable=False),
    )
    updated_at: datetime = Field(default_factory=utcnow)
    created_at: datetime = Field(default_factory=utcnow)


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


class AppSetting(SQLModel, table=True):
    __tablename__ = "settings"

    key: str = Field(primary_key=True)
    value: str = ""
    is_secret: bool = False
    updated_at: datetime = Field(default_factory=utcnow)
