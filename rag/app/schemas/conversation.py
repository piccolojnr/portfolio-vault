"""Conversation + Message schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class MessageRead(BaseModel):
    id: UUID
    role: str
    content: str
    doc_type: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationSummary(BaseModel):
    id: UUID
    title: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConversationDetail(ConversationSummary):
    messages: list[MessageRead]


class ConversationPatch(BaseModel):
    title: str | None = None


class MessageCreate(BaseModel):
    role: str
    content: str
    doc_type: str | None = None
