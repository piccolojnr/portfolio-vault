"""
Conversations Router
====================

CRUD for conversations and messages under /api/v1/conversations.
All endpoints require authentication; data is scoped to the caller's org.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request

from portfolio_rag.app.core.db import get_db_conn
from portfolio_rag.app.core.dependencies import get_current_user, get_live_settings
from portfolio_rag.domain.models.conversation import (
    ConversationDetail,
    ConversationPatch,
    ConversationSummary,
    MessageCreate,
    MessageRead,
    MessagesPage,
    SummaryUpdate,
)
from portfolio_rag.domain.services import conversations as svc
from portfolio_rag.infrastructure.db.scoped_repository import ConversationRepository

router = APIRouter(prefix="/conversations", tags=["conversations"])


def _repo(session, current_user: dict) -> ConversationRepository:
    return ConversationRepository(session, UUID(current_user["org_id"]))


@router.post("", response_model=ConversationSummary, status_code=201)
async def create_conversation(
    session=Depends(get_db_conn),
    current_user: dict = Depends(get_current_user),
):
    conv = await _repo(session, current_user).create()
    return ConversationSummary.model_validate(conv)


@router.get("", response_model=list[ConversationSummary])
async def list_conversations(
    session=Depends(get_db_conn),
    current_user: dict = Depends(get_current_user),
):
    return await _repo(session, current_user).list()


@router.get("/{conv_id}", response_model=ConversationDetail)
async def get_conversation(
    conv_id: UUID,
    session=Depends(get_db_conn),
    current_user: dict = Depends(get_current_user),
):
    try:
        return await _repo(session, current_user).get(conv_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/{conv_id}", response_model=ConversationSummary)
async def patch_conversation(
    conv_id: UUID,
    body: ConversationPatch,
    session=Depends(get_db_conn),
    current_user: dict = Depends(get_current_user),
):
    try:
        conv = await _repo(session, current_user).patch(conv_id, body.title)
        return ConversationSummary.model_validate(conv)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{conv_id}", status_code=204)
async def delete_conversation(
    conv_id: UUID,
    session=Depends(get_db_conn),
    current_user: dict = Depends(get_current_user),
):
    try:
        await _repo(session, current_user).delete(conv_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/{conv_id}/summary", status_code=204)
async def update_summary(
    conv_id: UUID,
    body: SummaryUpdate,
    session=Depends(get_db_conn),
    current_user: dict = Depends(get_current_user),
):
    # Summary updates come from background workers that already verified ownership
    # at message-add time. Re-verify here for defence in depth.
    try:
        await _repo(session, current_user).get(conv_id)  # ownership check
        await svc.update_summary(
            session, conv_id, body.summary, body.summarised_up_to_message_id
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{conv_id}/messages", response_model=MessagesPage)
async def get_messages(
    conv_id: UUID,
    cursor: Optional[datetime] = None,
    limit: int = 20,
    session=Depends(get_db_conn),
    current_user: dict = Depends(get_current_user),
):
    try:
        msgs, has_more = await _repo(session, current_user).get_messages_page(
            conv_id, limit=limit, cursor=cursor
        )
        return MessagesPage(
            messages=[MessageRead.model_validate(m) for m in msgs],
            has_more=has_more,
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{conv_id}/messages", response_model=MessageRead, status_code=201)
async def add_message(
    conv_id: UUID,
    body: MessageCreate,
    background_tasks: BackgroundTasks,
    request: Request,
    session=Depends(get_db_conn),
    current_user: dict = Depends(get_current_user),
    settings=Depends(get_live_settings),
):
    repo = _repo(session, current_user)
    try:
        msg = await repo.add_message(
            conv_id, body.role, body.content, body.doc_type, body.meta
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Trigger auto-title after first assistant message if conversation is untitled
    if body.role == "assistant":
        should_title = await repo.needs_title(conv_id)
        if should_title:
            question = await svc.get_first_user_message(session, conv_id)
            if question:
                factory = request.app.state.db_session_factory
                background_tasks.add_task(
                    svc.auto_title_bg,
                    factory,
                    conv_id,
                    question,
                    body.content,
                    settings,
                )

    return MessageRead.model_validate(msg)
