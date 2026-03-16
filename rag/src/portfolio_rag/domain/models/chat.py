"""Chat request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatStreamRequest(BaseModel):
    message: str
    history: list[ChatMessage]
    conversation_id: str | None = None
