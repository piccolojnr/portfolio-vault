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
    meta: dict | None = None
    sources: list[dict] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationSummary(BaseModel):
    id: UUID
    title: str | None
    created_at: datetime
    updated_at: datetime
    summary: str | None = None
    summarised_up_to_message_id: UUID | None = None

    model_config = {"from_attributes": True}


class ConversationDetail(ConversationSummary):
    messages: list[MessageRead]
    has_more: bool = False


class MessagesPage(BaseModel):
    messages: list[MessageRead]
    has_more: bool


class ConversationPatch(BaseModel):
    title: str | None = None


class SummaryUpdate(BaseModel):
    summary: str
    summarised_up_to_message_id: UUID


class MessageCreate(BaseModel):
    role: str
    content: str
    doc_type: str | None = None
    meta: dict | None = None
    sources: list[dict] | None = None
