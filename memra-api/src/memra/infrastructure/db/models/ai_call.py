"""AiCall SQLModel table — logs every LLM/embedding call and its cost."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Column, DateTime, Integer, Numeric, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlmodel import Field, SQLModel

from memra.infrastructure.db.models.base import utcnow


class AiCall(SQLModel, table=True):
    __tablename__ = "ai_calls"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
    )
    call_type: str = Field(sa_column=Column(Text, nullable=False))
    model: str = Field(sa_column=Column(Text, nullable=False))
    provider: str = Field(sa_column=Column(Text, nullable=False))
    input_tokens: Optional[int] = Field(default=None, sa_column=Column(Integer, nullable=True))
    output_tokens: Optional[int] = Field(default=None, sa_column=Column(Integer, nullable=True))
    cost_usd: Optional[float] = Field(default=None, sa_column=Column(Numeric(10, 6), nullable=True))
    job_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(UUID(as_uuid=True), nullable=True),
    )
    conversation_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(UUID(as_uuid=True), nullable=True),
    )
    doc_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(UUID(as_uuid=True), nullable=True),
    )
    user_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(UUID(as_uuid=True), nullable=True, index=True),
    )
    org_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(UUID(as_uuid=True), nullable=True, index=True),
    )
    duration_ms: Optional[int] = Field(default=None, sa_column=Column(Integer, nullable=True))
    created_at: datetime = Field(default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
