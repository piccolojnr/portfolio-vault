"""AdminAuditLog SQLModel table."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Column, Field, SQLModel

from memra.infrastructure.db.models.base import utcnow


class AdminAuditLog(SQLModel, table=True):
    __tablename__ = "admin_audit_log"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
    )
    admin_id: uuid.UUID = Field(
        sa_column=Column(
            sa.UUID(as_uuid=True),
            sa.ForeignKey("platform_admins.id"),
            nullable=False,
        )
    )
    action: str = Field(sa_column=Column(sa.String, nullable=False))
    target_type: Optional[str] = Field(default=None, sa_column=Column(sa.String, nullable=True))
    target_id: Optional[str] = Field(default=None, sa_column=Column(sa.String, nullable=True))
    details: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column("metadata", JSONB, nullable=False, server_default="{}"),
    )
    ip_address: Optional[str] = Field(default=None, sa_column=Column(sa.String, nullable=True))
    created_at: datetime = Field(default_factory=utcnow)
