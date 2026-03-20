"""Tests for memra.domain.services.paystack_service — PaystackService."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from memra.domain.services.paystack_service import (
    PaystackService,
    PaystackTransactionInitResult,
)
from tests.conftest import make_mock_session, make_test_settings


def _run(coro):
    """Run an async coroutine synchronously — works without pytest-asyncio."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


class TestWebhookSignatureVerification:
    """Test the static HMAC-SHA512 signature verification."""

    def test_valid_signature(self):
        secret = "sk_test_secret"
        body = b'{"event":"charge.success","data":{}}'
        digest = hmac.new(secret.encode(), body, hashlib.sha512).hexdigest()

        assert PaystackService.verify_webhook_signature(
            secret_key=secret,
            raw_body=body,
            signature_header=digest,
        )

    def test_invalid_signature(self):
        secret = "sk_test_secret"
        body = b'{"event":"charge.success"}'

        assert not PaystackService.verify_webhook_signature(
            secret_key=secret,
            raw_body=body,
            signature_header="bad_signature",
        )

    def test_sha512_prefix_stripped(self):
        secret = "sk_test_secret"
        body = b'{"event":"test"}'
        digest = hmac.new(secret.encode(), body, hashlib.sha512).hexdigest()

        assert PaystackService.verify_webhook_signature(
            secret_key=secret,
            raw_body=body,
            signature_header=f"sha512={digest}",
        )

    def test_empty_body(self):
        secret = "sk_test_secret"
        body = b""
        digest = hmac.new(secret.encode(), body, hashlib.sha512).hexdigest()

        assert PaystackService.verify_webhook_signature(
            secret_key=secret,
            raw_body=body,
            signature_header=digest,
        )

    def test_wrong_secret_fails(self):
        body = b'{"event":"test"}'
        digest = hmac.new(b"correct_secret", body, hashlib.sha512).hexdigest()

        assert not PaystackService.verify_webhook_signature(
            secret_key="wrong_secret",
            raw_body=body,
            signature_header=digest,
        )

    def test_tampered_body(self):
        secret = "sk_test_secret"
        original = b'{"amount":100}'
        digest = hmac.new(secret.encode(), original, hashlib.sha512).hexdigest()
        tampered = b'{"amount":999}'

        assert not PaystackService.verify_webhook_signature(
            secret_key=secret,
            raw_body=tampered,
            signature_header=digest,
        )


class TestPaystackServiceGetSecret:
    """Test that _get_secret fetches from platform_settings_service."""

    def test_missing_secret_raises(self):
        session = make_mock_session()
        settings = make_test_settings(paystack_secret_key="")

        with patch(
            "memra.domain.services.platform_settings_service.get_value",
            new_callable=AsyncMock,
            return_value=None,
        ):
            svc = PaystackService(session=session, settings=settings)
            with pytest.raises(RuntimeError, match="Missing paystack_secret_key"):
                _run(svc._get_secret())

    def test_returns_secret_from_platform_settings(self):
        session = make_mock_session()
        settings = make_test_settings()

        with patch(
            "memra.domain.services.platform_settings_service.get_value",
            new_callable=AsyncMock,
            return_value="sk_test_real_key",
        ):
            svc = PaystackService(session=session, settings=settings)
            result = _run(svc._get_secret())
            assert result == "sk_test_real_key"


class TestPaystackServiceGetPlanCode:
    def test_pro_plan_code(self):
        session = make_mock_session()
        settings = make_test_settings()

        with patch(
            "memra.domain.services.platform_settings_service.get_value",
            new_callable=AsyncMock,
            return_value="PLN_test_pro",
        ):
            svc = PaystackService(session=session, settings=settings)
            result = _run(svc._get_plan_code("pro"))
            assert result == "PLN_test_pro"

    def test_enterprise_plan_code(self):
        session = make_mock_session()
        settings = make_test_settings()

        with patch(
            "memra.domain.services.platform_settings_service.get_value",
            new_callable=AsyncMock,
            return_value="PLN_test_ent",
        ):
            svc = PaystackService(session=session, settings=settings)
            result = _run(svc._get_plan_code("enterprise"))
            assert result == "PLN_test_ent"

    def test_missing_plan_code_raises(self):
        session = make_mock_session()
        settings = make_test_settings()

        with patch(
            "memra.domain.services.platform_settings_service.get_value",
            new_callable=AsyncMock,
            return_value=None,
        ):
            svc = PaystackService(session=session, settings=settings)
            with pytest.raises(RuntimeError, match="Missing paystack_pro_plan_code"):
                _run(svc._get_plan_code("pro"))


class TestPaystackTransactionInitResult:
    def test_frozen_dataclass(self):
        r = PaystackTransactionInitResult(authorization_url="https://checkout.paystack.com/abc")
        assert r.authorization_url == "https://checkout.paystack.com/abc"


class TestInitializeSubscriptionTransaction:
    def test_success(self):
        session = make_mock_session()
        settings = make_test_settings()

        with patch(
            "memra.domain.services.platform_settings_service.get_value",
            new_callable=AsyncMock,
            return_value="sk_test_key",
        ), patch.object(
            PaystackService,
            "_api_call",
            new_callable=AsyncMock,
            return_value={
                "status": True,
                "data": {"authorization_url": "https://checkout.paystack.com/test123"},
            },
        ):
            svc = PaystackService(session=session, settings=settings)
            result = _run(svc.initialize_subscription_transaction(
                email="user@test.com",
                tier="pro",
                callback_url="http://localhost/callback",
            ))
            assert isinstance(result, PaystackTransactionInitResult)
            assert result.authorization_url == "https://checkout.paystack.com/test123"

    def test_failure_status_false(self):
        session = make_mock_session()
        settings = make_test_settings()

        with patch(
            "memra.domain.services.platform_settings_service.get_value",
            new_callable=AsyncMock,
            return_value="sk_test_key",
        ), patch.object(
            PaystackService,
            "_api_call",
            new_callable=AsyncMock,
            return_value={"status": False, "message": "Bad request"},
        ):
            svc = PaystackService(session=session, settings=settings)
            with pytest.raises(RuntimeError, match="failed"):
                _run(svc.initialize_subscription_transaction(
                    email="user@test.com",
                    tier="pro",
                    callback_url="http://localhost/callback",
                ))

    def test_missing_authorization_url(self):
        session = make_mock_session()
        settings = make_test_settings()

        with patch(
            "memra.domain.services.platform_settings_service.get_value",
            new_callable=AsyncMock,
            return_value="sk_test_key",
        ), patch.object(
            PaystackService,
            "_api_call",
            new_callable=AsyncMock,
            return_value={"status": True, "data": {}},
        ):
            svc = PaystackService(session=session, settings=settings)
            with pytest.raises(RuntimeError, match="authorization_url"):
                _run(svc.initialize_subscription_transaction(
                    email="user@test.com",
                    tier="pro",
                    callback_url="http://localhost/callback",
                ))


class TestFetchSubscription:
    def test_success(self):
        session = make_mock_session()
        settings = make_test_settings()

        with patch(
            "memra.domain.services.platform_settings_service.get_value",
            new_callable=AsyncMock,
            return_value="sk_test_key",
        ), patch.object(
            PaystackService,
            "_api_call",
            new_callable=AsyncMock,
            return_value={
                "status": True,
                "data": {
                    "subscription_code": "SUB_test",
                    "email_token": "tok123",
                    "status": "active",
                },
            },
        ):
            svc = PaystackService(session=session, settings=settings)
            result = _run(svc.fetch_subscription(subscription_code="SUB_test"))
            assert result["email_token"] == "tok123"
            assert result["status"] == "active"

    def test_failure_no_data(self):
        session = make_mock_session()
        settings = make_test_settings()

        with patch(
            "memra.domain.services.platform_settings_service.get_value",
            new_callable=AsyncMock,
            return_value="sk_test_key",
        ), patch.object(
            PaystackService,
            "_api_call",
            new_callable=AsyncMock,
            return_value={"status": False},
        ):
            svc = PaystackService(session=session, settings=settings)
            with pytest.raises(RuntimeError, match="fetch failed"):
                _run(svc.fetch_subscription(subscription_code="SUB_bad"))


class TestDisableSubscription:
    def test_success(self):
        session = make_mock_session()
        settings = make_test_settings()

        with patch(
            "memra.domain.services.platform_settings_service.get_value",
            new_callable=AsyncMock,
            return_value="sk_test_key",
        ), patch.object(
            PaystackService,
            "_api_call",
            new_callable=AsyncMock,
            return_value={"status": True, "data": {"message": "Subscription disabled"}},
        ):
            svc = PaystackService(session=session, settings=settings)
            result = _run(svc.disable_subscription(
                subscription_code="SUB_test",
                email_token="tok123",
            ))
            assert result["message"] == "Subscription disabled"

    def test_already_inactive_404(self):
        session = make_mock_session()
        settings = make_test_settings()

        with patch(
            "memra.domain.services.platform_settings_service.get_value",
            new_callable=AsyncMock,
            return_value="sk_test_key",
        ), patch.object(
            PaystackService,
            "_api_call",
            new_callable=AsyncMock,
            return_value={
                "status": 404,
                "body": {"code": "not_found", "message": "Not found"},
            },
        ):
            svc = PaystackService(session=session, settings=settings)
            result = _run(svc.disable_subscription(
                subscription_code="SUB_gone",
                email_token="tok123",
            ))
            assert result["already_inactive"] is True


class TestEnableSubscription:
    def test_success(self):
        session = make_mock_session()
        settings = make_test_settings()

        with patch(
            "memra.domain.services.platform_settings_service.get_value",
            new_callable=AsyncMock,
            return_value="sk_test_key",
        ), patch.object(
            PaystackService,
            "_api_call",
            new_callable=AsyncMock,
            return_value={"status": True, "data": {"message": "Subscription enabled"}},
        ):
            svc = PaystackService(session=session, settings=settings)
            result = _run(svc.enable_subscription(
                subscription_code="SUB_test",
                email_token="tok123",
            ))
            assert result["message"] == "Subscription enabled"

    def test_already_active(self):
        session = make_mock_session()
        settings = make_test_settings()

        with patch(
            "memra.domain.services.platform_settings_service.get_value",
            new_callable=AsyncMock,
            return_value="sk_test_key",
        ), patch.object(
            PaystackService,
            "_api_call",
            new_callable=AsyncMock,
            return_value={
                "status": 400,
                "body": {
                    "code": "already_active",
                    "message": "Subscription is already active",
                },
            },
        ):
            svc = PaystackService(session=session, settings=settings)
            result = _run(svc.enable_subscription(
                subscription_code="SUB_active",
                email_token="tok123",
            ))
            assert result["already_active"] is True

    def test_permanently_cancelled(self):
        session = make_mock_session()
        settings = make_test_settings()

        with patch(
            "memra.domain.services.platform_settings_service.get_value",
            new_callable=AsyncMock,
            return_value="sk_test_key",
        ), patch.object(
            PaystackService,
            "_api_call",
            new_callable=AsyncMock,
            return_value={
                "status": 400,
                "body": {
                    "code": "invalid_params",
                    "message": "Subscription has been cancelled and cannot be reactivated",
                },
            },
        ):
            svc = PaystackService(session=session, settings=settings)
            result = _run(svc.enable_subscription(
                subscription_code="SUB_cancelled",
                email_token="tok123",
            ))
            assert result["permanently_cancelled"] is True


class TestVerifyTransaction:
    def test_success(self):
        session = make_mock_session()
        settings = make_test_settings()

        with patch(
            "memra.domain.services.platform_settings_service.get_value",
            new_callable=AsyncMock,
            return_value="sk_test_key",
        ), patch.object(
            PaystackService,
            "_api_call",
            new_callable=AsyncMock,
            return_value={
                "status": True,
                "data": {"status": "success", "reference": "ref_123"},
            },
        ):
            svc = PaystackService(session=session, settings=settings)
            result = _run(svc.verify_transaction(reference="ref_123"))
            assert result["status"] == "success"

    def test_failure(self):
        session = make_mock_session()
        settings = make_test_settings()

        with patch(
            "memra.domain.services.platform_settings_service.get_value",
            new_callable=AsyncMock,
            return_value="sk_test_key",
        ), patch.object(
            PaystackService,
            "_api_call",
            new_callable=AsyncMock,
            return_value={"status": False},
        ):
            svc = PaystackService(session=session, settings=settings)
            with pytest.raises(RuntimeError, match="verify failed"):
                _run(svc.verify_transaction(reference="ref_bad"))
