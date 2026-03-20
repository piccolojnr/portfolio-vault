"""
Shared test fixtures for the Memra API test suite.

Provides:
  - A fake Settings object with test-safe defaults
  - JWT helper to generate valid access tokens
  - FastAPI TestClient with dependency overrides for DB, auth, settings
  - Mock DB session for unit tests
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient

from memra.app.core.config import Settings


# ---------------------------------------------------------------------------
# Fake Settings
# ---------------------------------------------------------------------------

def make_test_settings(**overrides) -> Settings:
    """Return a Settings instance with deterministic test defaults."""
    defaults = dict(
        openai_api_key="sk-test-openai",
        anthropic_api_key="sk-test-anthropic",
        qdrant_url="http://localhost:6333",
        qdrant_api_key="",
        vector_provider="qdrant",
        database_url="postgresql://test:test@localhost:5432/test",
        secret_key="test-secret-key-32-chars-long!!",
        jwt_secret="test-jwt-secret",
        jwt_access_expiry_minutes=15,
        jwt_refresh_expiry_days=30,
        admin_jwt_secret="test-admin-jwt-secret",
        admin_jwt_refresh_expiry_days=7,
        storage_provider="local",
        supabase_storage_url="",
        supabase_storage_key="",
        storage_bucket="documents",
        email_backend="console",
        email_from="noreply@example.com",
        resend_api_key="",
        mailpit_host="localhost",
        mailpit_port=1025,
        app_name="Memra",
        app_url="http://localhost:3000",
        paystack_secret_key="sk_test_fake",
        paystack_public_key="pk_test_fake",
        paystack_pro_plan_code="PLN_pro_test",
        paystack_enterprise_plan_code="PLN_ent_test",
        log_level="WARNING",
        demo_mode="",
        local_dev_ephemeral=False,
        neo4j_uri="",
        neo4j_username="neo4j",
        neo4j_password="",
        environment="development",
        gunicorn_workers=4,
        cors_origins="",
        embedding_model="text-embedding-3-small",
        anthropic_model="claude-sonnet-4-6",
        openai_model="gpt-4o",
        classifier_anthropic_model="claude-haiku-4-5-20251001",
        classifier_openai_model="gpt-4o-mini",
        summarizer_anthropic_model="claude-haiku-4-5-20251001",
        summarizer_openai_model="gpt-4o-mini",
        cost_limit_usd=0.0,
    )
    defaults.update(overrides)

    with patch.object(Settings, "__init__", lambda self, **kw: None):
        s = object.__new__(Settings)
        for k, v in defaults.items():
            object.__setattr__(s, k, v)
    return s


@pytest.fixture
def settings():
    return make_test_settings()


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def make_access_token(
    settings: Settings,
    *,
    user_id: str | None = None,
    org_id: str | None = None,
    role: str = "owner",
    email: str = "test@example.com",
) -> str:
    from memra.app.core.security import create_access_token

    return create_access_token(
        user_id=user_id or str(uuid.uuid4()),
        org_id=org_id or str(uuid.uuid4()),
        role=role,
        email=email,
        settings=settings,
    )


@pytest.fixture
def test_user_id():
    return str(uuid.uuid4())


@pytest.fixture
def test_org_id():
    return str(uuid.uuid4())


@pytest.fixture
def access_token(settings, test_user_id, test_org_id):
    return make_access_token(
        settings,
        user_id=test_user_id,
        org_id=test_org_id,
        role="owner",
        email="test@example.com",
    )


@pytest.fixture
def auth_headers(access_token):
    return {"Authorization": f"Bearer {access_token}"}


# ---------------------------------------------------------------------------
# Mock DB session
# ---------------------------------------------------------------------------

class FakeScalarResult:
    """Mimics scalars().first() / .all() patterns."""

    def __init__(self, items):
        self._items = items if isinstance(items, list) else [items]

    def first(self):
        return self._items[0] if self._items else None

    def all(self):
        return self._items


class FakeExecuteResult:
    """Mimics session.execute(...) result."""

    def __init__(self, items=None, mappings=None):
        self._items = items
        self._mappings = mappings

    def scalars(self):
        return FakeScalarResult(self._items)

    def mappings(self):
        return FakeScalarResult(self._mappings or [])

    def scalar(self):
        if self._items:
            return self._items[0] if not isinstance(self._items, list) else self._items[0]
        return None


def make_mock_session(execute_side_effect=None):
    """Create a mock AsyncSession."""
    session = AsyncMock()
    session.add = MagicMock()
    session.delete = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    session.refresh = AsyncMock()
    session.close = AsyncMock()
    if execute_side_effect:
        session.execute = AsyncMock(side_effect=execute_side_effect)
    else:
        session.execute = AsyncMock(return_value=FakeExecuteResult())
    return session


@pytest.fixture
def mock_session():
    return make_mock_session()


# ---------------------------------------------------------------------------
# FastAPI TestClient with dependency overrides
# ---------------------------------------------------------------------------

@pytest.fixture
def app(settings, test_user_id, test_org_id):
    """Create a fresh FastAPI app with mocked dependencies."""
    from memra.app.main import create_app
    from memra.app.core.config import get_settings
    from memra.app.core.db import get_db_conn
    from memra.app.core.dependencies import get_current_user, get_live_settings

    application = create_app()

    mock_session = make_mock_session()

    async def _override_db():
        yield mock_session

    application.dependency_overrides[get_settings] = lambda: settings
    application.dependency_overrides[get_live_settings] = lambda: settings
    application.dependency_overrides[get_db_conn] = _override_db
    application.dependency_overrides[get_current_user] = lambda: {
        "sub": test_user_id,
        "org_id": test_org_id,
        "role": "owner",
        "email": "test@example.com",
        "email_verified": True,
        "display_name": "Test User",
        "onboarding_completed_at": None,
        "type": "access",
    }

    application.state.db_engine = None
    application.state.db_session_factory = None

    return application


@pytest.fixture
def client(app):
    """Synchronous test client."""
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
