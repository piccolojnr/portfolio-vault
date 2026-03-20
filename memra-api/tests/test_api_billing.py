"""Tests for /api/v1/billing endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from memra.app.core.config import get_settings
from memra.app.core.db import get_db_conn
from memra.app.core.dependencies import get_current_user, get_live_settings, require_role
from memra.app.main import create_app
from memra.infrastructure.db.models.org import Organisation
from memra.infrastructure.db.models.plan_limit import PlanLimit
from memra.infrastructure.db.models.subscription import Subscription
from tests.conftest import FakeExecuteResult, make_mock_session, make_test_settings


ORG_ID = uuid.uuid4()
USER_ID = uuid.uuid4()


def _user_payload(role="owner"):
    return {
        "sub": str(USER_ID),
        "org_id": str(ORG_ID),
        "role": role,
        "email": "owner@test.com",
        "email_verified": True,
        "display_name": "Test Owner",
        "type": "access",
    }


def _make_org(plan="free", plan_source="self_service"):
    org = MagicMock(spec=Organisation)
    org.id = ORG_ID
    org.plan = plan
    org.plan_source = plan_source
    org.name = "TestOrg"
    org.slug = "testorg"
    return org


def _make_plan_limit(tier="free", monthly_tokens=1_000_000, max_docs=50, max_corpora=3, max_members=5):
    pl = MagicMock(spec=PlanLimit)
    pl.plan_tier = tier
    pl.monthly_token_limit = monthly_tokens
    pl.max_documents = max_docs
    pl.max_corpora = max_corpora
    pl.max_members = max_members
    return pl


def _make_subscription(status="active", period_start=None, period_end=None):
    sub = MagicMock(spec=Subscription)
    sub.id = uuid.uuid4()
    sub.org_id = ORG_ID
    sub.status = status
    sub.current_period_start = period_start or datetime(2026, 3, 1)
    sub.current_period_end = period_end or datetime(2026, 4, 1)
    sub.paystack_subscription_code = "SUB_test"
    sub.paystack_email_token = "email_tok"
    sub.paystack_plan_code = "PLN_pro"
    sub.cancelled_at = None
    return sub


def _billing_app(mock_session, role="owner"):
    app = create_app()
    s = make_test_settings()

    async def _override_db():
        yield mock_session

    user = _user_payload(role=role)
    app.dependency_overrides[get_settings] = lambda: s
    app.dependency_overrides[get_live_settings] = lambda: s
    app.dependency_overrides[get_db_conn] = _override_db
    app.dependency_overrides[get_current_user] = lambda: user

    for role_name in ("owner", "admin", "member"):
        app.dependency_overrides[require_role(role_name)] = lambda: user

    app.state.db_engine = None
    app.state.db_session_factory = None
    return app


class TestGetBilling:
    def test_returns_billing_info(self):
        org = _make_org(plan="pro")
        plan_limit = _make_plan_limit(tier="pro", monthly_tokens=5_000_000)
        subscription = _make_subscription(status="active")

        call_count = 0

        async def _execute(stmt, params=None):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return FakeExecuteResult(items=[org])
            elif call_count == 2:
                return FakeExecuteResult(items=[plan_limit])
            elif call_count == 3:
                return FakeExecuteResult(items=[subscription])
            elif call_count == 4:
                return FakeExecuteResult(mappings=[{"used_tokens": 500_000}])
            elif call_count == 5:
                return FakeExecuteResult(mappings=[{"cnt": 10}])
            elif call_count == 6:
                return FakeExecuteResult(mappings=[{"cnt": 2}])
            elif call_count == 7:
                return FakeExecuteResult(mappings=[{"cnt": 3}])
            return FakeExecuteResult()

        session = make_mock_session()
        session.execute = AsyncMock(side_effect=_execute)

        app = _billing_app(session)
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.get("/api/v1/billing")

        assert resp.status_code == 200
        data = resp.json()
        assert data["plan"] == "pro"
        assert data["subscription_status"] == "active"
        assert data["usage"]["tokens_used"] == 500_000
        assert data["limits"]["documents"]["used"] == 10
        assert data["limits"]["members"]["used"] == 3

    def test_org_not_found(self):
        async def _execute(stmt, params=None):
            return FakeExecuteResult(items=[])

        session = make_mock_session()
        session.execute = AsyncMock(side_effect=_execute)

        app = _billing_app(session)
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.get("/api/v1/billing")

        assert resp.status_code == 404


class TestGetBillingRestrictions:
    def test_returns_restrictions(self):
        org = _make_org(plan="free")
        plan_limit = _make_plan_limit(tier="free", monthly_tokens=1_000_000, max_docs=50)
        call_count = 0

        async def _execute(stmt, params=None):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return FakeExecuteResult(items=[org])
            elif call_count == 2:
                return FakeExecuteResult(items=[plan_limit])
            elif call_count == 3:
                return FakeExecuteResult(items=[])  # no subscription
            elif call_count == 4:
                return FakeExecuteResult(mappings=[{"used_tokens": 100}])
            elif call_count == 5:
                return FakeExecuteResult(mappings=[{"cnt": 5}])
            return FakeExecuteResult()

        session = make_mock_session()
        session.execute = AsyncMock(side_effect=_execute)

        app = _billing_app(session)
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.get("/api/v1/billing/restrictions")

        assert resp.status_code == 200
        data = resp.json()
        assert data["plan"] == "free"
        assert data["subscription_blocked"] is False
        assert data["usage"]["tokens_used"] == 100
        assert data["limits"]["documents"]["used"] == 5

    def test_subscription_expired_blocked(self):
        org = _make_org(plan="pro", plan_source="self_service")
        plan_limit = _make_plan_limit(tier="pro", monthly_tokens=5_000_000)
        subscription = _make_subscription(
            status="non_renewing",
            period_end=datetime(2026, 2, 1),  # in the past
        )
        call_count = 0

        async def _execute(stmt, params=None):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return FakeExecuteResult(items=[org])
            elif call_count == 2:
                return FakeExecuteResult(items=[plan_limit])
            elif call_count == 3:
                return FakeExecuteResult(items=[subscription])
            elif call_count == 4:
                return FakeExecuteResult(mappings=[{"used_tokens": 0}])
            elif call_count == 5:
                return FakeExecuteResult(mappings=[{"cnt": 5}])
            return FakeExecuteResult()

        session = make_mock_session()
        session.execute = AsyncMock(side_effect=_execute)

        app = _billing_app(session)
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.get("/api/v1/billing/restrictions")

        assert resp.status_code == 200
        data = resp.json()
        assert data["subscription_blocked"] is True
        assert data["subscription_block_code"] == "subscription_expired"


class TestSubscribe:
    @patch("memra.domain.services.paystack_service.PaystackService.initialize_subscription_transaction")
    def test_subscribe_success(self, mock_init):
        from memra.domain.services.paystack_service import PaystackTransactionInitResult

        mock_init.return_value = PaystackTransactionInitResult(
            authorization_url="https://checkout.paystack.com/test"
        )

        org = _make_org(plan="free")
        call_count = 0

        async def _execute(stmt, params=None):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return FakeExecuteResult(items=[org])
            return FakeExecuteResult()

        session = make_mock_session()
        session.execute = AsyncMock(side_effect=_execute)

        app = _billing_app(session)
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/api/v1/billing/subscribe",
                json={"plan": "pro"},
            )

        assert resp.status_code == 200
        assert resp.json()["authorization_url"] == "https://checkout.paystack.com/test"

    def test_subscribe_invalid_plan(self):
        org = _make_org()
        call_count = 0

        async def _execute(stmt, params=None):
            nonlocal call_count
            call_count += 1
            return FakeExecuteResult(items=[org])

        session = make_mock_session()
        session.execute = AsyncMock(side_effect=_execute)

        app = _billing_app(session)
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/api/v1/billing/subscribe",
                json={"plan": "invalid_plan"},
            )

        assert resp.status_code == 400
        assert "Invalid plan" in resp.json()["detail"]

    def test_subscribe_enterprise_sales_only(self):
        org = _make_org()
        call_count = 0

        async def _execute(stmt, params=None):
            nonlocal call_count
            call_count += 1
            return FakeExecuteResult(items=[org])

        session = make_mock_session()
        session.execute = AsyncMock(side_effect=_execute)

        app = _billing_app(session)
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/api/v1/billing/subscribe",
                json={"plan": "enterprise"},
            )

        assert resp.status_code == 409
        detail = resp.json()["detail"]
        assert detail["code"] == "enterprise_sales_only"
        assert detail["contact_url"] == "/contact"


class TestEnterpriseRequest:
    @patch("memra.infrastructure.email.backends.get_email_backend")
    @patch("memra.infrastructure.email.renderer.get_renderer")
    def test_enterprise_request_sends_internal_and_confirmation(
        self, mock_get_renderer, mock_get_backend
    ):
        org = _make_org(plan="free")
        call_count = 0

        async def _execute(stmt, params=None):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return FakeExecuteResult(items=[org])
            return FakeExecuteResult()

        session = make_mock_session()
        session.execute = AsyncMock(side_effect=_execute)

        backend = MagicMock()
        backend.send = AsyncMock(return_value=None)
        mock_get_backend.return_value = backend

        renderer = MagicMock()
        renderer.render.side_effect = [
            MagicMock(to="sales@memraiq.com", subject="internal", html="<p>x</p>", text="x"),
            MagicMock(to="owner@test.com", subject="confirmation", html="<p>y</p>", text="y"),
        ]
        mock_get_renderer.return_value = renderer

        app = _billing_app(session)
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/api/v1/billing/enterprise-request",
                json={
                    "name": "Owner Name",
                    "email": "owner@test.com",
                    "company": "TestOrg",
                    "team_size": "25",
                    "message": "Need SSO and compliance docs",
                },
            )

        assert resp.status_code == 200
        assert resp.json()["status"] == "request_sent"
        assert renderer.render.call_count == 2
        assert backend.send.await_count == 2


class TestCancelSubscription:
    def test_no_subscription(self):
        org = _make_org(plan="pro")
        call_count = 0

        async def _execute(stmt, params=None):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return FakeExecuteResult(items=[org])
            elif call_count == 2:
                return FakeExecuteResult(items=[])  # no subscription
            return FakeExecuteResult()

        session = make_mock_session()
        session.execute = AsyncMock(side_effect=_execute)

        app = _billing_app(session)
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post("/api/v1/billing/cancel")

        assert resp.status_code == 200
        assert resp.json()["status"] == "no_subscription"


class TestResumeSubscription:
    def test_no_subscription(self):
        org = _make_org(plan="pro")
        call_count = 0

        async def _execute(stmt, params=None):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return FakeExecuteResult(items=[org])
            elif call_count == 2:
                return FakeExecuteResult(items=[])  # no subscription
            return FakeExecuteResult()

        session = make_mock_session()
        session.execute = AsyncMock(side_effect=_execute)

        app = _billing_app(session)
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post("/api/v1/billing/resume")

        assert resp.status_code == 200
        assert resp.json()["status"] == "no_subscription"


class TestBillingHistory:
    def test_empty_history(self):
        call_count = 0

        async def _execute(stmt, params=None):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return FakeExecuteResult(items=[0])  # total count = 0
            elif call_count == 2:
                return FakeExecuteResult(items=[])  # no rows
            return FakeExecuteResult()

        session = make_mock_session()
        session.execute = AsyncMock(side_effect=_execute)

        # Override scalar() for the count query
        first_result = MagicMock()
        first_result.scalar.return_value = 0
        second_result = FakeExecuteResult(items=[])

        results = [first_result, second_result]
        call_idx = 0

        async def _execute_v2(stmt, params=None):
            nonlocal call_idx
            r = results[call_idx] if call_idx < len(results) else FakeExecuteResult()
            call_idx += 1
            return r

        session.execute = AsyncMock(side_effect=_execute_v2)

        app = _billing_app(session)
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.get("/api/v1/billing/history")

        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []


class TestBillingCallback:
    @patch("memra.domain.services.paystack_service.PaystackService.verify_transaction")
    def test_callback_redirects(self, mock_verify):
        mock_verify.return_value = {"status": "success"}

        session = make_mock_session()
        app = _billing_app(session)
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.get(
                "/api/v1/billing/callback?reference=ref_123",
                follow_redirects=False,
            )
        assert resp.status_code == 307
        assert "/settings/billing" in resp.headers["location"]
