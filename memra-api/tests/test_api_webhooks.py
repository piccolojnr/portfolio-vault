"""Tests for the /api/v1/webhooks/paystack endpoint (integration-level)."""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from memra.app.core.config import get_settings
from memra.app.core.db import get_db_conn
from memra.app.core.dependencies import get_live_settings
from memra.app.main import create_app
from memra.infrastructure.db.models.payment_event import PaymentEvent
from tests.conftest import FakeExecuteResult, make_mock_session, make_test_settings


SECRET_KEY = "sk_test_webhook_secret"


def _sign(body: bytes) -> str:
    return hmac.new(SECRET_KEY.encode(), body, hashlib.sha512).hexdigest()


def _webhook_app(mock_session=None):
    """Build a test app for webhook testing."""
    app = create_app()
    s = make_test_settings(paystack_secret_key=SECRET_KEY)
    session = mock_session or make_mock_session()

    async def _override_db():
        yield session

    app.dependency_overrides[get_settings] = lambda: s
    app.dependency_overrides[get_live_settings] = lambda: s
    app.dependency_overrides[get_db_conn] = _override_db

    app.state.db_engine = None
    app.state.db_session_factory = None
    return app


class TestPaystackWebhookSignature:
    def test_missing_signature_returns_400(self):
        app = _webhook_app()
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/api/v1/webhooks/paystack",
                content=b'{"event":"test"}',
                headers={"Content-Type": "application/json"},
            )
        assert resp.status_code == 400
        assert "signature" in resp.json()["detail"].lower()

    @patch("memra.domain.services.paystack_service.PaystackService.verify_incoming_webhook_signature")
    def test_invalid_signature_returns_400(self, mock_verify):
        mock_verify.return_value = False

        app = _webhook_app()
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/api/v1/webhooks/paystack",
                content=b'{"event":"test"}',
                headers={
                    "Content-Type": "application/json",
                    "x-paystack-signature": "invalid_sig",
                },
            )
        assert resp.status_code == 400

    def test_invalid_json_returns_400(self):
        body = b"not json"
        sig = _sign(body)

        with patch(
            "memra.domain.services.paystack_service.PaystackService.verify_incoming_webhook_signature",
            new_callable=AsyncMock,
            return_value=True,
        ):
            app = _webhook_app()
            with TestClient(app, raise_server_exceptions=False) as client:
                resp = client.post(
                    "/api/v1/webhooks/paystack",
                    content=body,
                    headers={
                        "Content-Type": "application/json",
                        "x-paystack-signature": sig,
                    },
                )
        assert resp.status_code == 400

    def test_missing_event_field_returns_400(self):
        body = json.dumps({"data": {}}).encode()
        sig = _sign(body)

        with patch(
            "memra.domain.services.paystack_service.PaystackService.verify_incoming_webhook_signature",
            new_callable=AsyncMock,
            return_value=True,
        ):
            app = _webhook_app()
            with TestClient(app, raise_server_exceptions=False) as client:
                resp = client.post(
                    "/api/v1/webhooks/paystack",
                    content=body,
                    headers={
                        "Content-Type": "application/json",
                        "x-paystack-signature": sig,
                    },
                )
        assert resp.status_code == 400
        assert "event" in resp.json()["detail"].lower()


class TestPaystackWebhookIdempotency:
    def test_duplicate_event_skipped(self):
        """If a payment_event already processed, webhook should return ok immediately."""
        existing = MagicMock(spec=PaymentEvent)
        existing.id = uuid.uuid4()
        existing.processed = True

        call_count = 0

        async def _execute(stmt, params=None):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return FakeExecuteResult(items=[existing])
            return FakeExecuteResult()

        session = make_mock_session()
        session.execute = AsyncMock(side_effect=_execute)

        body = json.dumps({
            "event": "charge.success",
            "data": {"reference": "ref_dup_123"},
        }).encode()

        with patch(
            "memra.domain.services.paystack_service.PaystackService.verify_incoming_webhook_signature",
            new_callable=AsyncMock,
            return_value=True,
        ):
            app = _webhook_app(mock_session=session)
            with TestClient(app, raise_server_exceptions=False) as client:
                resp = client.post(
                    "/api/v1/webhooks/paystack",
                    content=body,
                    headers={
                        "Content-Type": "application/json",
                        "x-paystack-signature": _sign(body),
                    },
                )

        assert resp.status_code == 200
        assert resp.json()["ok"] is True


class TestPaystackWebhookEventHandling:
    def _make_webhook_request(self, event_type, data, session=None):
        """Helper: post a valid signed webhook payload."""
        session = session or make_mock_session()
        payload = {"event": event_type, "data": data}
        body = json.dumps(payload).encode()

        # Set up session to not find existing payment_event (not idempotent skip)
        call_count = 0
        original_execute = session.execute

        async def _execute(stmt, params=None):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return FakeExecuteResult(items=[])  # no existing payment_event
            return await original_execute(stmt, params)

        session.execute = AsyncMock(side_effect=_execute)

        with patch(
            "memra.domain.services.paystack_service.PaystackService.verify_incoming_webhook_signature",
            new_callable=AsyncMock,
            return_value=True,
        ), patch(
            "memra.domain.services.platform_settings_service.get_value",
            new_callable=AsyncMock,
            return_value=None,
        ):
            app = _webhook_app(mock_session=session)
            with TestClient(app, raise_server_exceptions=False) as client:
                resp = client.post(
                    "/api/v1/webhooks/paystack",
                    content=body,
                    headers={
                        "Content-Type": "application/json",
                        "x-paystack-signature": _sign(body),
                    },
                )
        return resp

    def test_unknown_event_still_200(self):
        """Unknown event types should not crash; webhook always returns 200."""
        resp = self._make_webhook_request("unknown.event.type", {"reference": "ref_unknown"})
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_charge_success_with_org_id(self):
        """charge.success with metadata.org_id should process without error."""
        org_id = str(uuid.uuid4())
        resp = self._make_webhook_request(
            "charge.success",
            {
                "reference": f"ref_charge_{uuid.uuid4().hex[:8]}",
                "metadata": {"org_id": org_id, "tier": "pro"},
                "customer": {"customer_code": "CUS_test"},
            },
        )
        assert resp.status_code == 200

    def test_subscription_not_renew(self):
        resp = self._make_webhook_request(
            "subscription.not_renew",
            {
                "subscription_code": "SUB_test_nr",
                "next_payment_date": "2026-05-01T00:00:00.000Z",
            },
        )
        assert resp.status_code == 200

    def test_invoice_payment_failed(self):
        resp = self._make_webhook_request(
            "invoice.payment_failed",
            {
                "subscription_code": "SUB_test_fail",
                "invoice_code": "INV_fail_123",
            },
        )
        assert resp.status_code == 200
