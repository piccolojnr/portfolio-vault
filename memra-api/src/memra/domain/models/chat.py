"""Chat request/response schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatStreamRequest(BaseModel):
    message: str
    history: list[ChatMessage]
    conversation_id: str | None = None
    lightrag_mode: str | None = Field(
        default=None,
        description=(
            "LightRAG retrieval mode override. Valid values: 'local' (default — entity-focused, "
            "fastest), 'hybrid' (local + global graph), 'global' (community summaries only), "
            "'naive' (vector search only, no graph). Default None falls back to 'local'."
        ),
    )
    intent_override: Literal["conversational", "retrieval", "document", "refinement"] | None = Field(
        default=None,
        description=(
            "Skip intent classification and force a specific intent. Useful for testing or "
            "when the caller already knows the desired pipeline branch. "
            "'conversational' skips RAG entirely; all others trigger retrieval."
        ),
    )
