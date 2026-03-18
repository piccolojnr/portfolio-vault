"""
Conversations Service
=====================

CRUD operations for conversations and messages.
Auto-title runs as a FastAPI BackgroundTask with its own DB session.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from portfolio_rag.infrastructure.db.models.base import utcnow
from portfolio_rag.infrastructure.db.models.conversation import Conversation, Message
from portfolio_rag.domain.models.conversation import ConversationDetail, ConversationSummary, MessageRead


# ── Conversation CRUD ──────────────────────────────────────────────────────────

async def list_conversations(
    session: AsyncSession, *, org_id: "uuid.UUID | None" = None
) -> list[ConversationSummary]:
    q = select(Conversation)
    if org_id is not None:
        q = q.where(Conversation.org_id == org_id)
    rows = (
        await session.execute(q.order_by(Conversation.updated_at.desc()))
    ).scalars().all()
    return [ConversationSummary.model_validate(c) for c in rows]


async def get_messages_page(
    session: AsyncSession,
    conv_id: UUID,
    limit: int = 20,
    cursor: datetime | None = None,
) -> tuple[list[Message], bool]:
    q = select(Message).where(Message.conversation_id == conv_id)
    if cursor:
        q = q.where(Message.created_at < cursor)
    q = q.order_by(Message.created_at.desc()).limit(limit + 1)
    rows = list((await session.execute(q)).scalars())
    has_more = len(rows) > limit
    rows = rows[:limit]
    rows.reverse()
    return rows, has_more


async def get_conversation(
    session: AsyncSession, conv_id: UUID, limit: int = 50
) -> ConversationDetail:
    conv = await session.get(Conversation, conv_id)
    if not conv:
        raise LookupError(f"Conversation {conv_id} not found")

    messages, has_more = await get_messages_page(session, conv_id, limit=limit)

    return ConversationDetail(
        id=conv.id,
        title=conv.title,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        summary=conv.summary,
        summarised_up_to_message_id=conv.summarised_up_to_message_id,
        messages=[MessageRead.model_validate(m) for m in messages],
        has_more=has_more,
    )


async def create_conversation(
    session: AsyncSession, *, org_id: "uuid.UUID | None" = None
) -> Conversation:
    conv = Conversation(org_id=org_id)
    session.add(conv)
    await session.commit()
    await session.refresh(conv)
    return conv


async def patch_conversation(
    session: AsyncSession, conv_id: UUID, title: str | None
) -> Conversation:
    conv = await session.get(Conversation, conv_id)
    if not conv:
        raise LookupError(f"Conversation {conv_id} not found")
    if title is not None:
        conv.title = title
        conv.updated_at = utcnow()
        session.add(conv)
        await session.commit()
        await session.refresh(conv)
    return conv


async def delete_conversation(session: AsyncSession, conv_id: UUID) -> None:
    conv = await session.get(Conversation, conv_id)
    if not conv:
        raise LookupError(f"Conversation {conv_id} not found")
    await session.delete(conv)
    await session.commit()


# ── Messages ───────────────────────────────────────────────────────────────────

async def add_message(
    session: AsyncSession,
    conv_id: UUID,
    role: str,
    content: str,
    doc_type: str | None = None,
    meta: dict | None = None,
    sources: list | None = None,
) -> Message:
    conv = await session.get(Conversation, conv_id)
    if not conv:
        raise LookupError(f"Conversation {conv_id} not found")

    msg = Message(
        conversation_id=conv_id,
        role=role,
        content=content,
        doc_type=doc_type,
        meta=meta,
        sources=sources,
    )
    session.add(msg)

    conv.updated_at = utcnow()
    session.add(conv)

    await session.commit()
    await session.refresh(msg)
    return msg


async def needs_title(session: AsyncSession, conv_id: UUID) -> bool:
    """Return True if this conversation has no title yet."""
    conv = await session.get(Conversation, conv_id)
    return conv is not None and conv.title is None


async def get_first_user_message(
    session: AsyncSession, conv_id: UUID
) -> str | None:
    msg = (
        await session.execute(
            select(Message)
            .where(Message.conversation_id == conv_id, Message.role == "user")
            .order_by(Message.created_at)
            .limit(1)
        )
    ).scalars().first()
    return msg.content if msg else None


# ── Summary ────────────────────────────────────────────────────────────────────

async def update_summary(
    session: AsyncSession,
    conv_id: UUID,
    summary: str,
    summarised_up_to_message_id: UUID,
) -> None:
    """Persist a rolling summary produced by the background summarisation job."""
    conv = await session.get(Conversation, conv_id)
    if not conv:
        raise LookupError(f"Conversation {conv_id} not found")
    conv.summary = summary
    conv.summarised_up_to_message_id = summarised_up_to_message_id
    session.add(conv)
    await session.commit()


# ── Auto-title (background task) ───────────────────────────────────────────────

async def auto_title_bg(
    session_factory,
    conv_id: UUID,
    question: str,
    answer: str,
    settings,
) -> None:
    """
    Generate a short title from the first exchange and persist it.
    Runs as a BackgroundTask with a fresh DB session. Ignores all errors.
    """
    try:
        title = await asyncio.to_thread(_generate_title, question, answer, settings)
        async with session_factory() as session:
            await patch_conversation(session, conv_id, title)
    except Exception:
        pass  # auto-title is best-effort


def _generate_title(question: str, answer: str, settings) -> str:
    """Sync: call cheapest available model to produce a 5-word title."""
    prompt = (
        "Summarise this Q&A in 5 words or fewer as a conversation title. "
        "Reply with only the title, no quotes, no punctuation at the end.\n\n"
        f"Q: {question[:300]}\nA: {answer[:300]}"
    )

    if settings.anthropic_api_key:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=20,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.content[0].text.strip().strip('"')

    if settings.openai_api_key:
        from openai import OpenAI
        client = OpenAI(api_key=settings.openai_api_key)
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=20,
            messages=[{"role": "user", "content": prompt}],
        )
        return (resp.choices[0].message.content or "").strip().strip('"')

    # No keys — fall back to truncated question
    return question[:60]
