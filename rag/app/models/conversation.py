"""Conversation + Message SQLModel tables."""

from datetime import datetime
from uuid import UUID, uuid4
from sqlalchemy import Column, DateTime, JSON
from sqlmodel import Field, SQLModel

from app.models.base import utcnow


class Conversation(SQLModel, table=True):
    __tablename__ = "conversations"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    title: str | None = None
    created_at: datetime = Field(
        default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    updated_at: datetime = Field(
        default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    # Rolling summary — updated in the background after trimming occurs
    summary: str | None = None
    summarised_up_to_message_id: UUID | None = Field(
        default=None, foreign_key="messages.id"
    )


class Message(SQLModel, table=True):
    __tablename__ = "messages"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    conversation_id: UUID = Field(foreign_key="conversations.id")
    role: str          # 'user' | 'assistant'
    content: str
    doc_type: str | None = None   # None | 'cv' | 'cover_letter' | 'resume' | 'bio'
    meta: dict | None = Field(default=None, sa_column=Column("meta", JSON, nullable=True))
    created_at: datetime = Field(
        default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False)
    )
