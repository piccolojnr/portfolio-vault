"""VaultDocument SQLModel table."""

from datetime import datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Column, Field, SQLModel

from portfolio_rag.infrastructure.db.models.base import utcnow


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
