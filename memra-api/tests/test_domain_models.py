"""Tests for Pydantic domain models (schemas)."""

from __future__ import annotations

from datetime import datetime

import pytest
from pydantic import ValidationError

from memra.domain.models.auth import (
    LoginRequest,
    MagicLinkRequest,
    MeResponse,
    OnboardingRequest,
    OrgRead,
    RegisterRequest,
    ResetPasswordRequest,
    SwitchOrgRequest,
    TokenResponse,
    UpdateMeRequest,
    UserRead,
    VerifyTokenRequest,
)
from memra.domain.models.document import (
    CorpusDocCreate,
    CorpusDocDetail,
    CorpusDocSummary,
    CorpusDocUpdate,
    DocumentStatusResponse,
    DuplicateCheckFile,
    DuplicateCheckRequest,
    DuplicateCheckResponse,
    DuplicateCheckResult,
    PaginatedDocs,
)
from memra.domain.models.conversation import (
    ConversationPatch,
    MessageCreate,
    MessageRead,
    MessagesPage,
    SummaryUpdate,
)


# ---------------------------------------------------------------------------
# Auth models
# ---------------------------------------------------------------------------


class TestRegisterRequest:
    def test_email_only(self):
        r = RegisterRequest(email="a@b.com")
        assert r.email == "a@b.com"
        assert r.password is None

    def test_with_password(self):
        r = RegisterRequest(email="a@b.com", password="secret")
        assert r.password == "secret"

    def test_missing_email_raises(self):
        with pytest.raises(ValidationError):
            RegisterRequest()


class TestLoginRequest:
    def test_valid(self):
        r = LoginRequest(email="a@b.com", password="pass")
        assert r.email == "a@b.com"

    def test_missing_password_raises(self):
        with pytest.raises(ValidationError):
            LoginRequest(email="a@b.com")


class TestTokenResponse:
    def test_defaults(self):
        t = TokenResponse(access_token="abc")
        assert t.token_type == "bearer"

    def test_custom_type(self):
        t = TokenResponse(access_token="abc", token_type="custom")
        assert t.token_type == "custom"


class TestMagicLinkRequest:
    def test_redirect_url_optional(self):
        r = MagicLinkRequest(email="a@b.com")
        assert r.redirect_url is None

    def test_with_redirect(self):
        r = MagicLinkRequest(email="a@b.com", redirect_url="http://localhost/cb")
        assert r.redirect_url == "http://localhost/cb"


class TestVerifyTokenRequest:
    def test_valid(self):
        r = VerifyTokenRequest(token="abc123")
        assert r.token == "abc123"


class TestResetPasswordRequest:
    def test_valid(self):
        r = ResetPasswordRequest(token="tok", new_password="newpass")
        assert r.new_password == "newpass"


class TestSwitchOrgRequest:
    def test_valid(self):
        r = SwitchOrgRequest(org_id="some-uuid")
        assert r.org_id == "some-uuid"


class TestOnboardingRequest:
    def test_valid(self):
        r = OnboardingRequest(use_case="research")
        assert r.use_case == "research"


class TestUpdateMeRequest:
    def test_all_none(self):
        r = UpdateMeRequest()
        assert r.display_name is None
        assert r.use_case is None

    def test_partial(self):
        r = UpdateMeRequest(display_name="Alice")
        assert r.display_name == "Alice"
        assert r.use_case is None


class TestUserRead:
    def test_valid(self):
        u = UserRead(
            id="123",
            email="a@b.com",
            email_verified=True,
            created_at=datetime(2024, 1, 1),
        )
        assert u.display_name is None
        assert u.onboarding_completed_at is None


class TestOrgRead:
    def test_valid(self):
        o = OrgRead(id="1", name="Org", slug="org", plan="free", role="owner")
        assert o.plan == "free"


class TestMeResponse:
    def test_composite(self):
        me = MeResponse(
            user=UserRead(
                id="1", email="a@b.com", email_verified=True,
                created_at=datetime(2024, 1, 1),
            ),
            org=OrgRead(id="1", name="Org", slug="org", plan="free", role="owner"),
        )
        assert me.user.email == "a@b.com"
        assert me.org.name == "Org"


# ---------------------------------------------------------------------------
# Document models
# ---------------------------------------------------------------------------


class TestCorpusDocCreate:
    def test_defaults(self):
        d = CorpusDocCreate(slug="test", title="Test", type="markdown")
        assert d.extracted_text == ""
        assert d.corpus_id == "default"

    def test_custom(self):
        d = CorpusDocCreate(
            slug="s", title="T", type="text", extracted_text="hello", corpus_id="c1"
        )
        assert d.extracted_text == "hello"
        assert d.corpus_id == "c1"


class TestCorpusDocUpdate:
    def test_all_none(self):
        u = CorpusDocUpdate()
        assert u.title is None
        assert u.extracted_text is None

    def test_partial(self):
        u = CorpusDocUpdate(title="Updated")
        assert u.title == "Updated"


class TestCorpusDocSummary:
    def test_valid(self):
        s = CorpusDocSummary(
            id="1",
            corpus_id="c",
            slug="s",
            type="text",
            title="T",
            created_at=datetime(2024, 1, 1),
            updated_at=datetime(2024, 1, 1),
        )
        assert s.lightrag_status is None
        assert s.source_type == "text"
        assert s.file_size is None


class TestCorpusDocDetail:
    def test_inherits_summary(self):
        d = CorpusDocDetail(
            id="1",
            corpus_id="c",
            slug="s",
            type="text",
            title="T",
            created_at=datetime(2024, 1, 1),
            updated_at=datetime(2024, 1, 1),
            extracted_text="content here",
        )
        assert d.extracted_text == "content here"
        assert d.slug == "s"


class TestPaginatedDocs:
    def test_valid(self):
        p = PaginatedDocs(items=[], total=0, page=1, page_size=20, pages=0)
        assert p.items == []


class TestDuplicateCheckFile:
    def test_valid(self):
        f = DuplicateCheckFile(filename="test.pdf", hash="abc", size=100, mimetype="application/pdf")
        assert f.filename == "test.pdf"


class TestDuplicateCheckRequest:
    def test_valid(self):
        r = DuplicateCheckRequest(
            files=[
                DuplicateCheckFile(filename="a.pdf", hash="h1", size=50, mimetype="application/pdf"),
            ]
        )
        assert len(r.files) == 1
        assert r.corpus_id is None


class TestDuplicateCheckResult:
    def test_valid(self):
        r = DuplicateCheckResult(filename="a.pdf", hash="h1", status="new")
        assert r.existing_title is None


class TestDuplicateCheckResponse:
    def test_valid(self):
        resp = DuplicateCheckResponse(
            results=[DuplicateCheckResult(filename="a.pdf", hash="h1", status="duplicate", existing_title="Old")]
        )
        assert resp.results[0].status == "duplicate"


class TestDocumentStatusResponse:
    def test_valid(self):
        s = DocumentStatusResponse(id="1", slug="s", status="ready")
        assert s.error is None


# ---------------------------------------------------------------------------
# Conversation models
# ---------------------------------------------------------------------------


class TestConversationPatch:
    def test_valid(self):
        p = ConversationPatch(title="New Title")
        assert p.title == "New Title"


class TestSummaryUpdate:
    def test_valid(self):
        import uuid
        msg_id = uuid.uuid4()
        s = SummaryUpdate(summary="A summary", summarised_up_to_message_id=msg_id)
        assert s.summary == "A summary"
        assert s.summarised_up_to_message_id == msg_id


class TestMessageCreate:
    def test_minimal(self):
        m = MessageCreate(role="user", content="Hello")
        assert m.role == "user"
        assert m.content == "Hello"
