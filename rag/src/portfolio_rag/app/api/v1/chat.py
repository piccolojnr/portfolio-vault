"""
Chat Router
===========

POST /api/v1/chat/stream

Thin HTTP layer — all business logic lives in domain.services.chat.

SSE events emitted (by the service/pipeline):
  data: {"text": "..."}                       — streamed delta
  data: {"saved": {"doc_type", "meta", ...}}  — after DB persistence
  data: [DONE]                                — end sentinel
  data: {"error": "...", "stage": "..."}      — on error
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from portfolio_rag.app.core.config import Settings
from portfolio_rag.app.core.db import get_db_conn
from portfolio_rag.app.core.dependencies import get_current_user, get_live_settings
from portfolio_rag.app.core.limiter import limiter
from portfolio_rag.domain.models.chat import ChatStreamRequest
from portfolio_rag.domain.services import chat as svc
from portfolio_rag.infrastructure.db.scoped_repository import ConversationRepository

router = APIRouter(tags=["chat"])

SSE_HEADERS = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
}


@router.post("/chat/stream")
@limiter.limit("10/minute")
async def chat_stream(
    body: ChatStreamRequest,
    request: Request,
    live_settings: Settings = Depends(get_live_settings),
    session=Depends(get_db_conn),
    current_user: dict = Depends(get_current_user),
):
    from uuid import UUID
    org_id = UUID(current_user["org_id"])
    user_id = UUID(current_user["sub"])

    # Ownership gate — 404 if the conversation belongs to a different user
    if body.conversation_id:
        repo = ConversationRepository(session, org_id, user_id)
        try:
            await repo.get(UUID(body.conversation_id), limit=0)
        except LookupError:
            raise HTTPException(status_code=404, detail="Conversation not found")

    stream = await svc.build_event_stream(
        message=body.message,
        history=[m.model_dump() for m in body.history],
        conversation_id=body.conversation_id,
        session=session,
        db_session_factory=request.app.state.db_session_factory,
        live_settings=live_settings,
        lightrag_mode=body.lightrag_mode,
        intent_override=body.intent_override,
        org_id=org_id,
    )
    return StreamingResponse(stream, headers=SSE_HEADERS)
