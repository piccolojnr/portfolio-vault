"""Tests for RAG and Org domain models."""

from __future__ import annotations

from datetime import datetime

import pytest
from pydantic import ValidationError

from memra.domain.models.rag import (
    QueryRequest,
    QueryResponse,
    RetrievedChunk,
    RetrieveResponse,
)
from memra.domain.models.org import (
    CorpusRead,
    InviteMemberRequest,
    InvitePreview,
    InviteRead,
    MemberRead,
    OrgWithRole,
    TransferOwnershipRequest,
    UpdateOrgRequest,
    UpdateRoleRequest,
)


# ---------------------------------------------------------------------------
# RAG models
# ---------------------------------------------------------------------------


class TestQueryRequest:
    def test_defaults(self):
        q = QueryRequest(question="What is X?")
        assert q.n_results == 5

    def test_custom_n_results(self):
        q = QueryRequest(question="What?", n_results=10)
        assert q.n_results == 10

    def test_missing_question_raises(self):
        with pytest.raises(ValidationError):
            QueryRequest()


class TestRetrievedChunk:
    def test_valid(self):
        c = RetrievedChunk(
            content="text here",
            source="doc.md",
            heading="Section 1",
            similarity=0.95,
        )
        assert c.similarity == 0.95


class TestRetrieveResponse:
    def test_valid(self):
        r = RetrieveResponse(
            question="Q?",
            retrieved_chunks=[
                RetrievedChunk(
                    content="c", source="s", heading="h", similarity=0.8
                )
            ],
            mode="default",
        )
        assert len(r.retrieved_chunks) == 1

    def test_empty_chunks(self):
        r = RetrieveResponse(
            question="Q?", retrieved_chunks=[], mode="hybrid"
        )
        assert r.retrieved_chunks == []


class TestQueryResponse:
    def test_valid(self):
        r = QueryResponse(
            question="Q?",
            retrieved_chunks=[],
            answer="The answer is 42.",
            mode="default",
        )
        assert r.answer == "The answer is 42."


# ---------------------------------------------------------------------------
# Org models
# ---------------------------------------------------------------------------


class TestCorpusRead:
    def test_valid(self):
        c = CorpusRead(
            id="1",
            name="Default",
            corpus_key="default-key",
            created_at=datetime(2024, 1, 1),
        )
        assert c.corpus_key == "default-key"


class TestOrgWithRole:
    def test_valid(self):
        o = OrgWithRole(
            id="1", name="Org", slug="org", plan="pro", role="admin"
        )
        assert o.role == "admin"


class TestMemberRead:
    def test_valid(self):
        m = MemberRead(
            user_id="u1",
            email="m@test.com",
            role="member",
            joined_at=datetime(2024, 6, 1),
        )
        assert m.role == "member"


class TestInvitePreview:
    def test_valid(self):
        ip = InvitePreview(
            org_name="Org",
            org_slug="org",
            invited_by_email="inviter@test.com",
            email="invited@test.com",
            role="member",
            expires_at=datetime(2026, 12, 31),
        )
        assert ip.invited_by_email == "inviter@test.com"

    def test_invited_by_none(self):
        ip = InvitePreview(
            org_name="Org",
            org_slug="org",
            invited_by_email=None,
            email="invited@test.com",
            role="admin",
            expires_at=datetime(2026, 12, 31),
        )
        assert ip.invited_by_email is None


class TestInviteRead:
    def test_valid(self):
        ir = InviteRead(
            id="inv-1",
            org_id="org-1",
            email="invited@test.com",
            role="member",
            invited_by="user-1",
            expires_at=datetime(2026, 12, 31),
            accepted=False,
            created_at=datetime(2026, 1, 1),
        )
        assert ir.accepted is False


class TestInviteMemberRequest:
    def test_defaults(self):
        r = InviteMemberRequest(email="new@test.com")
        assert r.role == "member"

    def test_custom_role(self):
        r = InviteMemberRequest(email="new@test.com", role="admin")
        assert r.role == "admin"


class TestUpdateRoleRequest:
    def test_valid(self):
        r = UpdateRoleRequest(role="admin")
        assert r.role == "admin"


class TestTransferOwnershipRequest:
    def test_valid(self):
        r = TransferOwnershipRequest(new_owner_user_id="user-123")
        assert r.new_owner_user_id == "user-123"


class TestUpdateOrgRequest:
    def test_valid(self):
        r = UpdateOrgRequest(name="New Org Name")
        assert r.name == "New Org Name"
