"""PaymentEvents SQLModel table for Paystack webhook idempotency/audit."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

import sqlalchemy as sa
from sqlmodel import Field, SQLModel
from sqlalchemy.dialects.postgresql import JSONB

from memra.infrastructure.db.models.base import utcnow


class PaymentEvent(SQLModel, table=True):
    __tablename__ = "payment_events"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=sa.Column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
    )

    paystack_event: str = Field(sa_column=sa.Column(sa.Text, nullable=False))
    paystack_reference: str = Field(
        sa_column=sa.Column(sa.Text, nullable=False, unique=True)
    )
    org_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=sa.Column(sa.UUID(as_uuid=True), sa.ForeignKey("organisations.id"), nullable=True),
    )

    raw_payload: dict[str, Any] = Field(
        sa_column=sa.Column(JSONB, nullable=False)
    )

    processed: bool = Field(default=False, sa_column=sa.Column(sa.Boolean, nullable=False, server_default=sa.text("false")))
    error: Optional[str] = Field(default=None, sa_column=sa.Column(sa.Text, nullable=True))

    created_at: datetime = Field(default_factory=utcnow, sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False))

