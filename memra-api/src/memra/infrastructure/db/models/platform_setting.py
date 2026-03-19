"""PlatformSetting SQLModel table."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

import sqlalchemy as sa
from sqlmodel import Column, Field, SQLModel

from memra.infrastructure.db.models.base import utcnow


class PlatformSetting(SQLModel, table=True):
    __tablename__ = "platform_settings"

    key: str = Field(sa_column=Column(sa.String, primary_key=True))
    value: Optional[str] = Field(default=None, sa_column=Column(sa.String, nullable=True))
    is_secret: bool = Field(default=False)
    description: Optional[str] = Field(default=None, sa_column=Column(sa.String, nullable=True))
    updated_at: datetime = Field(default_factory=utcnow)
    updated_by: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            sa.UUID(as_uuid=True),
            sa.ForeignKey("platform_admins.id"),
            nullable=True,
        ),
    )
