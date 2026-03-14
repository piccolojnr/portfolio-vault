"""
Conversations Router
====================

CRUD for conversations and messages under /api/v1/conversations.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request

from app.db import get_db_conn
from app.dependencies import get_live_settings
from app.schemas.conversation import (
    ConversationDetail,
    ConversationPatch,
    ConversationSummary,
    MessageCreate,
    MessageRead,
)
from app.services import conversations as svc

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.post("", response_model=ConversationSummary, status_code=201)
async def create_conversation(session=Depends(get_db_conn)):
    conv = await svc.create_conversation(session)
    return ConversationSummary.model_validate(conv)


@router.get("", response_model=list[ConversationSummary])
async def list_conversations(session=Depends(get_db_conn)):
    return await svc.list_conversations(session)


@router.get("/{conv_id}", response_model=ConversationDetail)
async def get_conversation(conv_id: UUID, session=Depends(get_db_conn)):
    try:
        return await svc.get_conversation(session, conv_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/{conv_id}", response_model=ConversationSummary)
async def patch_conversation(
    conv_id: UUID,
    body: ConversationPatch,
    session=Depends(get_db_conn),
):
    try:
        conv = await svc.patch_conversation(session, conv_id, body.title)
        return ConversationSummary.model_validate(conv)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{conv_id}", status_code=204)
async def delete_conversation(conv_id: UUID, session=Depends(get_db_conn)):
    try:
        await svc.delete_conversation(session, conv_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{conv_id}/messages", response_model=MessageRead, status_code=201)
async def add_message(
    conv_id: UUID,
    body: MessageCreate,
    background_tasks: BackgroundTasks,
    request: Request,
    session=Depends(get_db_conn),
    settings=Depends(get_live_settings),
):
    try:
        msg = await svc.add_message(
            session, conv_id, body.role, body.content, body.doc_type
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Trigger auto-title after first assistant message if conversation is untitled
    if body.role == "assistant":
        should_title = await svc.needs_title(session, conv_id)
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
