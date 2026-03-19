"""AdminRefreshToken SQLModel table — separate from user refresh tokens."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

import sqlalchemy as sa
from sqlmodel import Column, Field, SQLModel

from memra.infrastructure.db.models.base import utcnow


class AdminRefreshToken(SQLModel, table=True):
    __tablename__ = "admin_refresh_tokens"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
    )
    admin_id: uuid.UUID = Field(
        sa_column=Column(
            sa.UUID(as_uuid=True),
            sa.ForeignKey("platform_admins.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    token_hash: str = Field(sa_column=Column(sa.String(64), unique=True, nullable=False))
    expires_at: datetime = Field(sa_column=Column(sa.DateTime(timezone=True), nullable=False))
    revoked: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow)
    ip_address: Optional[str] = Field(default=None, sa_column=Column(sa.String, nullable=True))
