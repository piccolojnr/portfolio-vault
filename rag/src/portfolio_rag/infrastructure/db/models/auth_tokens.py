"""Auth token SQLModel tables: refresh, magic-link, password-reset."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

import sqlalchemy as sa
from sqlmodel import Column, Field, SQLModel

from portfolio_rag.infrastructure.db.models.base import utcnow


class RefreshToken(SQLModel, table=True):
    __tablename__ = "refresh_tokens"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
    )
    user_id: uuid.UUID = Field(
        sa_column=Column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True)
    )
    token_hash: str = Field(sa_column=Column(sa.String(64), unique=True, nullable=False))
    revoked: bool = Field(default=False)
    last_used_at: Optional[datetime] = Field(default=None, sa_column=Column(sa.DateTime, nullable=True))
    expires_at: datetime = Field(sa_column=Column(sa.DateTime, nullable=False))
    created_at: datetime = Field(default_factory=utcnow)


class MagicLinkToken(SQLModel, table=True):
    __tablename__ = "magic_link_tokens"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
    )
    email: str = Field(sa_column=Column(sa.String, nullable=False, index=True))
    token_hash: str = Field(sa_column=Column(sa.String(64), unique=True, nullable=False))
    used: bool = Field(default=False)
    expires_at: datetime = Field(sa_column=Column(sa.DateTime, nullable=False))
    created_at: datetime = Field(default_factory=utcnow)


class PasswordResetToken(SQLModel, table=True):
    __tablename__ = "password_reset_tokens"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
    )
    user_id: uuid.UUID = Field(
        sa_column=Column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True)
    )
    token_hash: str = Field(sa_column=Column(sa.String(64), unique=True, nullable=False))
    used: bool = Field(default=False)
    expires_at: datetime = Field(sa_column=Column(sa.DateTime, nullable=False))
    created_at: datetime = Field(default_factory=utcnow)
