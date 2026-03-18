"""Organisation SQLModel tables: organisations, members, invites, settings."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

import sqlalchemy as sa
from sqlmodel import Column, Field, SQLModel

from portfolio_rag.infrastructure.db.models.base import utcnow


class Organisation(SQLModel, table=True):
    __tablename__ = "organisations"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
    )
    name: str = Field(sa_column=Column(sa.String, nullable=False))
    slug: str = Field(sa_column=Column(sa.String, unique=True, nullable=False, index=True))
    plan: str = Field(default="free")
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    # Nullable FK to corpora.id — set after corpus creation to avoid circular dep at DDL time
    active_corpus_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(sa.UUID(as_uuid=True), nullable=True),
    )


class OrganisationMember(SQLModel, table=True):
    __tablename__ = "organisation_members"

    user_id: uuid.UUID = Field(
        sa_column=Column(
            sa.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            primary_key=True,
            nullable=False,
        )
    )
    org_id: uuid.UUID = Field(
        sa_column=Column(
            sa.UUID(as_uuid=True),
            sa.ForeignKey("organisations.id"),
            primary_key=True,
            nullable=False,
        )
    )
    role: str = Field(default="member")
    joined_at: datetime = Field(default_factory=utcnow)


class OrganisationInvite(SQLModel, table=True):
    __tablename__ = "organisation_invites"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
    )
    org_id: uuid.UUID = Field(
        sa_column=Column(sa.UUID(as_uuid=True), sa.ForeignKey("organisations.id"), nullable=False)
    )
    email: str = Field(sa_column=Column(sa.String, nullable=False))
    role: str = Field(default="member")
    token_hash: str = Field(sa_column=Column(sa.String(64), unique=True, nullable=False))
    invited_by: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
    )
    expires_at: datetime = Field(sa_column=Column(sa.DateTime, nullable=False))
    accepted: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow)


class OrganisationSetting(SQLModel, table=True):
    __tablename__ = "organisation_settings"

    org_id: uuid.UUID = Field(
        sa_column=Column(
            sa.UUID(as_uuid=True),
            sa.ForeignKey("organisations.id"),
            primary_key=True,
            nullable=False,
        )
    )
    key: str = Field(sa_column=Column(sa.String, primary_key=True, nullable=False))
    value: str = Field(default="")
    is_secret: bool = Field(default=False)
    updated_at: datetime = Field(default_factory=utcnow)
