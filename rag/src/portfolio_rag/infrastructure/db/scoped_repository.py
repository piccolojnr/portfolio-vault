"""
Scoped Repository
=================

Base class + concrete repositories for org-scoped data access.
Every query includes an org_id filter so one tenant can never see another's data.

Usage in routers:
    repo = DocumentRepository(session, UUID(current_user["org_id"]))
    docs = await repo.list(page=1, page_size=20)
"""

from __future__ import annotations

import math
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import func, select

from portfolio_rag.infrastructure.db.models.conversation import Conversation, Message
from portfolio_rag.infrastructure.db.models.document import Document
from portfolio_rag.infrastructure.db.models.base import utcnow
from portfolio_rag.domain.models.document import (
    CorpusDocCreate,
    CorpusDocSummary,
    CorpusDocUpdate,
    DuplicateCheckFile,
    DuplicateCheckResponse,
    DuplicateCheckResult,
    PaginatedDocs,
)
from portfolio_rag.domain.models.conversation import (
    ConversationDetail,
    ConversationSummary,
    MessageRead,
)


# ── Base ───────────────────────────────────────────────────────────────────────

class ScopedRepository:
    """Requires org_id at construction — never accept it from request input."""

    def __init__(self, session: AsyncSession, org_id: uuid.UUID) -> None:
        if not isinstance(org_id, uuid.UUID):
            raise TypeError("org_id must be a uuid.UUID instance")
        self._session = session
        self._org_id = org_id

    @property
    def org_id(self) -> uuid.UUID:
        return self._org_id


# ── Document Repository ────────────────────────────────────────────────────────

SUPPORTED_MIMETYPES = {"text/plain", "text/markdown"}


class DocumentRepository(ScopedRepository):
    """Org-scoped CRUD for corpus documents."""

    async def list(self, page: int, page_size: int) -> PaginatedDocs:
        total: int = (
            await self._session.execute(
                select(func.count())
                .select_from(Document)
                .where(Document.org_id == self._org_id)
            )
        ).scalar_one()

        offset = (page - 1) * page_size
        rows = (
            await self._session.execute(
                select(Document)
                .where(Document.org_id == self._org_id)
                .order_by(Document.type, Document.slug)
                .offset(offset)
                .limit(page_size)
            )
        ).scalars().all()

        return PaginatedDocs(
            items=[_doc_summary(d) for d in rows],
            total=total,
            page=page,
            page_size=page_size,
            pages=max(1, math.ceil(total / page_size)),
        )

    async def get_by_slug(self, slug: str) -> Document:
        doc = (
            await self._session.execute(
                select(Document)
                .where(Document.slug == slug, Document.org_id == self._org_id)
            )
        ).scalars().first()
        if doc is None:
            raise LookupError(f"Document '{slug}' not found")
        return doc

    async def get_by_id(self, doc_id: str) -> Document:
        try:
            uid = uuid.UUID(doc_id)
        except ValueError:
            raise LookupError(f"Invalid document id: {doc_id!r}")
        doc = (
            await self._session.execute(
                select(Document)
                .where(Document.id == uid, Document.org_id == self._org_id)
            )
        ).scalars().first()
        if doc is None:
            raise LookupError(f"Document '{doc_id}' not found")
        return doc

    async def create(self, data: CorpusDocCreate) -> Document:
        existing = (
            await self._session.execute(
                select(Document)
                .where(Document.slug == data.slug, Document.org_id == self._org_id)
            )
        ).scalars().first()
        if existing:
            raise ValueError(f"Slug '{data.slug}' already exists")

        doc = Document(
            corpus_id=data.corpus_id,
            type=data.type,
            slug=data.slug,
            title=data.title,
            extracted_text=data.extracted_text,
            org_id=self._org_id,
        )
        self._session.add(doc)
        await self._session.commit()
        await self._session.refresh(doc)
        return doc

    async def update(self, slug: str, patch: CorpusDocUpdate) -> Document:
        doc = await self.get_by_slug(slug)
        if patch.title is not None:
            doc.title = patch.title
        if patch.extracted_text is not None:
            doc.extracted_text = patch.extracted_text
        if patch.corpus_id is not None:
            doc.corpus_id = patch.corpus_id
        if patch.type is not None:
            doc.type = patch.type
        doc.updated_at = utcnow()
        self._session.add(doc)
        await self._session.commit()
        await self._session.refresh(doc)
        return doc

    async def delete(self, slug: str) -> None:
        doc = await self.get_by_slug(slug)
        await self._session.delete(doc)
        await self._session.commit()

    async def check_duplicates(
        self, files: list[DuplicateCheckFile]
    ) -> DuplicateCheckResponse:
        hashes = [f.hash for f in files]
        rows = (
            await self._session.execute(
                select(Document).where(
                    Document.org_id == self._org_id,
                    Document.file_hash.in_(hashes),
                )
            )
        ).scalars().all()
        hash_to_title = {r.file_hash: r.title for r in rows if r.file_hash}

        results: list[DuplicateCheckResult] = []
        for f in files:
            if f.mimetype not in SUPPORTED_MIMETYPES:
                results.append(
                    DuplicateCheckResult(filename=f.filename, hash=f.hash, status="unsupported")
                )
            elif f.hash in hash_to_title:
                results.append(
                    DuplicateCheckResult(
                        filename=f.filename,
                        hash=f.hash,
                        status="duplicate",
                        existing_title=hash_to_title[f.hash],
                    )
                )
            else:
                results.append(
                    DuplicateCheckResult(filename=f.filename, hash=f.hash, status="new")
                )
        return DuplicateCheckResponse(results=results)

    async def create_uploaded(
        self,
        *,
        corpus_id: str,
        slug: str,
        title: str,
        mimetype: str,
        file_hash: str,
        file_path: str,
        file_size: int,
        extracted_text: str = "",
    ) -> Document:
        existing = (
            await self._session.execute(
                select(Document)
                .where(Document.slug == slug, Document.org_id == self._org_id)
            )
        ).scalars().first()
        if existing:
            raise ValueError(f"Slug '{slug}' already exists")

        doc = Document(
            corpus_id=corpus_id,
            type="file",
            slug=slug,
            title=title,
            source_type="file",
            mimetype=mimetype,
            file_hash=file_hash,
            file_path=file_path,
            file_size=file_size,
            extracted_text=extracted_text,
            doc_metadata={"lightrag_status": "pending"},
            org_id=self._org_id,
        )
        self._session.add(doc)
        await self._session.commit()
        await self._session.refresh(doc)
        return doc


# ── Conversation Repository ────────────────────────────────────────────────────

class ConversationRepository(ScopedRepository):
    """Org + user-scoped CRUD for conversations and messages."""

    def __init__(self, session: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID) -> None:
        super().__init__(session, org_id)
        if not isinstance(user_id, uuid.UUID):
            raise TypeError("user_id must be a uuid.UUID instance")
        self._user_id = user_id

    async def list(self) -> list[ConversationSummary]:
        rows = (
            await self._session.execute(
                select(Conversation)
                .where(
                    Conversation.org_id == self._org_id,
                    Conversation.user_id == self._user_id,
                )
                .order_by(Conversation.updated_at.desc())
            )
        ).scalars().all()
        return [ConversationSummary.model_validate(c) for c in rows]

    async def get(self, conv_id: uuid.UUID, limit: int = 50) -> ConversationDetail:
        conv = (
            await self._session.execute(
                select(Conversation).where(
                    Conversation.id == conv_id,
                    Conversation.org_id == self._org_id,
                    Conversation.user_id == self._user_id,
                )
            )
        ).scalars().first()
        if conv is None:
            raise LookupError(f"Conversation {conv_id} not found")

        messages, has_more = await self._get_messages_page(conv_id, limit=limit)
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

    async def create(self) -> Conversation:
        conv = Conversation(org_id=self._org_id, user_id=self._user_id)
        self._session.add(conv)
        await self._session.commit()
        await self._session.refresh(conv)
        return conv

    async def patch(self, conv_id: uuid.UUID, title: str | None) -> Conversation:
        conv = await self._get_scoped(conv_id)
        if title is not None:
            conv.title = title
            conv.updated_at = utcnow()
            self._session.add(conv)
            await self._session.commit()
            await self._session.refresh(conv)
        return conv

    async def delete(self, conv_id: uuid.UUID) -> None:
        conv = await self._get_scoped(conv_id)
        await self._session.delete(conv)
        await self._session.commit()

    async def add_message(
        self,
        conv_id: uuid.UUID,
        role: str,
        content: str,
        doc_type: str | None = None,
        meta: dict | None = None,
        sources: list | None = None,
    ) -> Message:
        conv = await self._get_scoped(conv_id)
        msg = Message(
            conversation_id=conv_id,
            role=role,
            content=content,
            doc_type=doc_type,
            meta=meta,
            sources=sources,
        )
        self._session.add(msg)
        conv.updated_at = utcnow()
        self._session.add(conv)
        await self._session.commit()
        await self._session.refresh(msg)
        return msg

    async def get_messages_page(
        self,
        conv_id: uuid.UUID,
        limit: int = 20,
        cursor: Optional[datetime] = None,
    ) -> tuple[list[Message], bool]:
        await self._get_scoped(conv_id)  # ownership check
        return await self._get_messages_page(conv_id, limit=limit, cursor=cursor)

    async def needs_title(self, conv_id: uuid.UUID) -> bool:
        conv = (
            await self._session.execute(
                select(Conversation).where(
                    Conversation.id == conv_id,
                    Conversation.org_id == self._org_id,
                    Conversation.user_id == self._user_id,
                )
            )
        ).scalars().first()
        return conv is not None and conv.title is None

    # ── Internal helpers ───────────────────────────────────────────────────────

    async def _get_scoped(self, conv_id: uuid.UUID) -> Conversation:
        conv = (
            await self._session.execute(
                select(Conversation).where(
                    Conversation.id == conv_id,
                    Conversation.org_id == self._org_id,
                    Conversation.user_id == self._user_id,
                )
            )
        ).scalars().first()
        if conv is None:
            raise LookupError(f"Conversation {conv_id} not found")
        return conv

    async def _get_messages_page(
        self,
        conv_id: uuid.UUID,
        limit: int = 20,
        cursor: Optional[datetime] = None,
    ) -> tuple[list[Message], bool]:
        q = select(Message).where(Message.conversation_id == conv_id)
        if cursor:
            q = q.where(Message.created_at < cursor)
        q = q.order_by(Message.created_at.desc()).limit(limit + 1)
        rows = list((await self._session.execute(q)).scalars())
        has_more = len(rows) > limit
        rows = rows[:limit]
        rows.reverse()
        return rows, has_more


# ── Helpers ────────────────────────────────────────────────────────────────────

def _doc_summary(d: Document) -> CorpusDocSummary:
    return CorpusDocSummary(
        id=str(d.id),
        corpus_id=d.corpus_id,
        slug=d.slug,
        type=d.type,
        title=d.title,
        created_at=d.created_at,
        updated_at=d.updated_at,
        lightrag_status=(d.doc_metadata or {}).get("lightrag_status"),
        source_type=d.source_type,
        file_size=d.file_size,
        mimetype=d.mimetype,
    )
