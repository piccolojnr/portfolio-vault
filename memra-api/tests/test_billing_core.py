"""Tests for memra.app.core.billing — plan limits and paywall error handling."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from memra.app.core.billing import (
    PaywallError,
    _month_bounds,
    _naive_utc,
    _tier_allows,
    paywall_error_handler,
)


class TestMonthBounds:
    def test_regular_month(self):
        now = datetime(2026, 3, 15)
        start, end = _month_bounds(now)
        assert start == datetime(2026, 3, 1)
        assert end == datetime(2026, 4, 1)

    def test_december_wraps_to_next_year(self):
        now = datetime(2025, 12, 25)
        start, end = _month_bounds(now)
        assert start == datetime(2025, 12, 1)
        assert end == datetime(2026, 1, 1)

    def test_january(self):
        now = datetime(2026, 1, 1)
        start, end = _month_bounds(now)
        assert start == datetime(2026, 1, 1)
        assert end == datetime(2026, 2, 1)

    def test_february_leap_year(self):
        now = datetime(2024, 2, 29)
        start, end = _month_bounds(now)
        assert start == datetime(2024, 2, 1)
        assert end == datetime(2024, 3, 1)


class TestNaiveUtc:
    def test_already_naive(self):
        dt = datetime(2026, 1, 1, 12, 0, 0)
        assert _naive_utc(dt) is dt

    def test_timezone_aware(self):
        dt = datetime(2026, 1, 1, 14, 0, 0, tzinfo=timezone.utc)
        result = _naive_utc(dt)
        assert result.tzinfo is None
        assert result.hour == 14


class TestTierAllows:
    def test_free_allows_free(self):
        assert _tier_allows("free", "free") is True

    def test_free_denies_pro(self):
        assert _tier_allows("free", "pro") is False

    def test_free_denies_enterprise(self):
        assert _tier_allows("free", "enterprise") is False

    def test_pro_allows_free(self):
        assert _tier_allows("pro", "free") is True

    def test_pro_allows_pro(self):
        assert _tier_allows("pro", "pro") is True

    def test_pro_denies_enterprise(self):
        assert _tier_allows("pro", "enterprise") is False

    def test_enterprise_allows_all(self):
        assert _tier_allows("enterprise", "free") is True
        assert _tier_allows("enterprise", "pro") is True
        assert _tier_allows("enterprise", "enterprise") is True

    def test_unknown_plan_treated_as_zero(self):
        assert _tier_allows("unknown", "free") is True
        assert _tier_allows("unknown", "pro") is False


class TestPaywallError:
    def test_stores_status_code_and_payload(self):
        err = PaywallError(
            status_code=402,
            payload={"error": "Token limit exceeded.", "code": "token_limit_exceeded"},
        )
        assert err.status_code == 402
        assert err.payload["code"] == "token_limit_exceeded"
        assert str(err) == "token_limit_exceeded"

    def test_handler_returns_json_response(self):
        from unittest.mock import MagicMock

        request = MagicMock()
        err = PaywallError(
            status_code=403,
            payload={"error": "Model not available", "code": "model_not_available"},
        )
        response = paywall_error_handler(request, err)
        assert response.status_code == 403

    def test_error_message_from_error_field(self):
        err = PaywallError(
            status_code=402,
            payload={"error": "Doc limit exceeded."},
        )
        assert str(err) == "Doc limit exceeded."

    def test_error_message_from_code_field(self):
        err = PaywallError(
            status_code=402,
            payload={"code": "some_code"},
        )
        assert str(err) == "some_code"
