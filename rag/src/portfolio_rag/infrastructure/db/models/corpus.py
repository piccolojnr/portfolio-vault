"""Corpus SQLModel table — scoped knowledge base per organisation."""

from __future__ import annotations

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlmodel import Column, Field, SQLModel

from portfolio_rag.infrastructure.db.models.base import utcnow


class Corpus(SQLModel, table=True):
    __tablename__ = "corpora"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
    )
    org_id: uuid.UUID = Field(
        sa_column=Column(
            sa.UUID(as_uuid=True),
            sa.ForeignKey("organisations.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    name: str = Field(sa_column=Column(sa.Text, nullable=False))
    corpus_key: str = Field(sa_column=Column(sa.Text, nullable=False))  # LightRAG workspace string
    created_at: datetime = Field(default_factory=utcnow)
