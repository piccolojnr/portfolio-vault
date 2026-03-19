"""User SQLModel table."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

import sqlalchemy as sa
from sqlmodel import Column, Field, SQLModel

from memra.infrastructure.db.models.base import utcnow


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
    )
    email: str = Field(sa_column=Column(sa.String, unique=True, nullable=False, index=True))
    password_hash: Optional[str] = Field(default=None, sa_column=Column(sa.String, nullable=True))
    email_verified: bool = Field(default=False)
    onboarding_completed_at: Optional[datetime] = Field(default=None, sa_column=Column(sa.DateTime(timezone=True), nullable=True))
    use_case: Optional[str] = Field(default=None, sa_column=Column(sa.String, nullable=True))
    display_name: Optional[str] = Field(default=None, sa_column=Column(sa.String(128), nullable=True))
    disabled: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
