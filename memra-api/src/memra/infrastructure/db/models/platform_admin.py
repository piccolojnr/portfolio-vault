"""PlatformAdmin SQLModel table."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

import sqlalchemy as sa
from sqlmodel import Column, Field, SQLModel

from memra.infrastructure.db.models.base import utcnow


class PlatformAdmin(SQLModel, table=True):
    __tablename__ = "platform_admins"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
    )
    email: str = Field(sa_column=Column(sa.String, unique=True, nullable=False))
    password_hash: str = Field(sa_column=Column(sa.String, nullable=False))
    name: str = Field(sa_column=Column(sa.String, nullable=False))
    must_change_password: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utcnow)
    last_login_at: Optional[datetime] = Field(
        default=None, sa_column=Column(sa.DateTime(timezone=True), nullable=True)
    )
