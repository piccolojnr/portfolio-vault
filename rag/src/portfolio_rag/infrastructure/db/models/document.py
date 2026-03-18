"""Document SQLModel table."""

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Column, Field, SQLModel

from portfolio_rag.infrastructure.db.models.base import utcnow

DEFAULT_CORPUS_ID = "portfolio_vault"


class Document(SQLModel, table=True):
    __tablename__ = "documents"
    __table_args__ = (
        sa.UniqueConstraint("org_id", "slug", name="uq_documents_org_slug"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    corpus_id: str = DEFAULT_CORPUS_ID
    type: str
    slug: str = Field(sa_column=Column(sa.String, nullable=False))
    title: str = ""
    extracted_text: str = ""
    source_type: str = "text"         # "text" | "file"
    file_path: Optional[str] = None
    file_size: Optional[int] = None
    mimetype: Optional[str] = None
    file_hash: Optional[str] = None
    doc_metadata: dict = Field(
        default_factory=dict,
        sa_column=Column("metadata", JSONB, nullable=False),
    )
    org_id: Optional[UUID] = Field(
        default=None,
        sa_column=Column(
            sa.UUID(as_uuid=True),
            sa.ForeignKey("organisations.id"),
            nullable=True,
            index=True,
        ),
    )
    updated_at: datetime = Field(default_factory=utcnow)
    created_at: datetime = Field(default_factory=utcnow)
