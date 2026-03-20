"""Tests for memra.app.api.v1.webhooks — Paystack webhook processing."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest

from memra.app.api.v1.webhooks import (
    _derive_idempotency_key,
    _extract_customer_code,
    _extract_email_token,
    _extract_metadata,
    _extract_plan_code,
    _extract_subscription_code,
    _find_first_string_by_keys,
    _parse_dt,
    _tier_from_plan_code,
    _webhook_safe_context,
)


class TestFindFirstStringByKeys:
    def test_flat_dict(self):
        assert _find_first_string_by_keys({"a": "hello"}, {"a"}) == "hello"

    def test_nested_dict(self):
        data = {"outer": {"inner": {"plan_code": "PLN_123"}}}
        assert _find_first_string_by_keys(data, {"plan_code"}) == "PLN_123"

    def test_list_nesting(self):
        data = [{"a": "nope"}, {"plan_code": "PLN_found"}]
        assert _find_first_string_by_keys(data, {"plan_code"}) == "PLN_found"

    def test_returns_none_if_not_found(self):
        assert _find_first_string_by_keys({"a": "b"}, {"c"}) is None

    def test_skips_empty_strings(self):
        data = {"plan_code": "", "nested": {"plan_code": "PLN_ok"}}
        assert _find_first_string_by_keys(data, {"plan_code"}) == "PLN_ok"

    def test_skips_non_string_values(self):
        data = {"plan_code": 123, "nested": {"plan_code": "PLN_str"}}
        assert _find_first_string_by_keys(data, {"plan_code"}) == "PLN_str"


class TestExtractMetadata:
    def test_returns_dict(self):
        assert _extract_metadata({"metadata": {"org_id": "abc"}}) == {"org_id": "abc"}

    def test_returns_empty_dict_if_missing(self):
        assert _extract_metadata({}) == {}

    def test_returns_empty_dict_if_non_dict(self):
        assert _extract_metadata({"metadata": "string"}) == {}

    def test_returns_empty_dict_if_none(self):
        assert _extract_metadata({"metadata": None}) == {}


class TestExtractPlanCode:
    def test_from_plan_dict(self):
        data = {"plan": {"plan_code": "PLN_123"}}
        assert _extract_plan_code(data) == "PLN_123"

    def test_from_metadata(self):
        data = {"metadata": {"plan_code": "PLN_456"}}
        assert _extract_plan_code(data) == "PLN_456"

    def test_from_top_level(self):
        data = {"plan_code": "PLN_789"}
        assert _extract_plan_code(data) == "PLN_789"

    def test_recursive_search(self):
        data = {"nested": {"deep": {"plan_code": "PLN_deep"}}}
        assert _extract_plan_code(data) == "PLN_deep"

    def test_none_when_absent(self):
        assert _extract_plan_code({}) is None

    def test_planCode_variant(self):
        data = {"plan": {"planCode": "PLN_camel"}}
        assert _extract_plan_code(data) == "PLN_camel"


class TestExtractSubscriptionCode:
    def test_direct_string(self):
        assert _extract_subscription_code({"subscription_code": "SUB_1"}) == "SUB_1"

    def test_nested_subscription_dict(self):
        data = {"subscription": {"subscription_code": "SUB_2"}}
        assert _extract_subscription_code(data) == "SUB_2"

    def test_nested_code_key(self):
        data = {"subscription": {"code": "SUB_3"}}
        assert _extract_subscription_code(data) == "SUB_3"

    def test_recursive_fallback(self):
        data = {"outer": {"subscription_code": "SUB_4"}}
        assert _extract_subscription_code(data) == "SUB_4"

    def test_none_when_absent(self):
        assert _extract_subscription_code({}) is None


class TestExtractEmailToken:
    def test_direct(self):
        assert _extract_email_token({"email_token": "tok1"}) == "tok1"

    def test_emailToken_variant(self):
        assert _extract_email_token({"emailToken": "tok2"}) == "tok2"

    def test_from_subscription_dict(self):
        data = {"subscription": {"email_token": "tok3"}}
        assert _extract_email_token(data) == "tok3"

    def test_recursive_fallback(self):
        data = {"nested": {"email_token": "tok4"}}
        assert _extract_email_token(data) == "tok4"

    def test_none_when_absent(self):
        assert _extract_email_token({}) is None


class TestExtractCustomerCode:
    def test_from_customer_dict(self):
        data = {"customer": {"customer_code": "CUS_1"}}
        assert _extract_customer_code(data) == "CUS_1"

    def test_from_customer_code_field(self):
        data = {"customer": {"code": "CUS_2"}}
        assert _extract_customer_code(data) == "CUS_2"

    def test_top_level_customer_code(self):
        data = {"customer_code": "CUS_3"}
        assert _extract_customer_code(data) == "CUS_3"

    def test_customer_string(self):
        data = {"customer": "CUS_4"}
        assert _extract_customer_code(data) == "CUS_4"

    def test_none_when_absent(self):
        assert _extract_customer_code({}) is None


class TestTierFromPlanCode:
    def test_pro_match(self):
        assert _tier_from_plan_code(
            pro_code="PLN_pro", enterprise_code="PLN_ent", plan_code="PLN_pro"
        ) == "pro"

    def test_enterprise_match(self):
        assert _tier_from_plan_code(
            pro_code="PLN_pro", enterprise_code="PLN_ent", plan_code="PLN_ent"
        ) == "enterprise"

    def test_unknown_plan(self):
        assert _tier_from_plan_code(
            pro_code="PLN_pro", enterprise_code="PLN_ent", plan_code="PLN_other"
        ) is None

    def test_none_plan_code(self):
        assert _tier_from_plan_code(
            pro_code="PLN_pro", enterprise_code="PLN_ent", plan_code=None
        ) is None

    def test_none_pro_code(self):
        assert _tier_from_plan_code(
            pro_code=None, enterprise_code="PLN_ent", plan_code="PLN_pro"
        ) is None


class TestWebhookSafeContext:
    def test_minimal(self):
        ctx = _webhook_safe_context(data={}, org_id=None)
        assert ctx["org_id"] is None
        assert ctx["has_subscription_code"] is False

    def test_with_data(self):
        org_id = uuid.uuid4()
        data = {
            "subscription_code": "SUB_1",
            "customer": {"customer_code": "CUS_1"},
            "plan": {"plan_code": "PLN_1"},
            "email_token": "tok1",
        }
        ctx = _webhook_safe_context(data=data, org_id=org_id)
        assert ctx["org_id"] == str(org_id)
        assert ctx["has_subscription_code"] is True
        assert ctx["has_customer_code"] is True
        assert ctx["has_plan_code"] is True
        assert ctx["has_email_token"] is True


class TestParseDt:
    def test_none_returns_none(self):
        assert _parse_dt(None) is None

    def test_datetime_passthrough(self):
        dt = datetime(2024, 1, 1, tzinfo=timezone.utc)
        assert _parse_dt(dt) is dt

    def test_iso_string_with_z(self):
        result = _parse_dt("2026-04-20T02:41:00.000Z")
        assert isinstance(result, datetime)
        assert result.tzinfo is None  # normalized to naive UTC
        assert result.year == 2026
        assert result.month == 4
        assert result.day == 20

    def test_iso_string_with_offset(self):
        result = _parse_dt("2026-01-15T10:00:00+02:00")
        assert isinstance(result, datetime)
        assert result.tzinfo is None
        assert result.hour == 8  # converted to UTC

    def test_invalid_string(self):
        assert _parse_dt("not-a-date") is None

    def test_non_string_non_datetime(self):
        assert _parse_dt(12345) is None


class TestDeriveIdempotencyKey:
    def test_uses_reference(self):
        assert _derive_idempotency_key("charge.success", {"reference": "ref_123"}) == "ref_123"

    def test_uses_invoice_code(self):
        key = _derive_idempotency_key("invoice.create", {"invoice_code": "INV_1"})
        assert key == "invoice.create:INV_1"

    def test_uses_subscription_code(self):
        key = _derive_idempotency_key("subscription.create", {"subscription_code": "SUB_1"})
        assert key == "subscription.create:SUB_1"

    def test_fallback_uuid(self):
        key = _derive_idempotency_key("unknown.event", {})
        assert key.startswith("unknown.event:")

    def test_priority_reference_over_invoice(self):
        data = {"reference": "ref_first", "invoice_code": "INV_second"}
        assert _derive_idempotency_key("charge.success", data) == "ref_first"

    def test_strips_whitespace_reference(self):
        assert _derive_idempotency_key("charge.success", {"reference": " ref_space "}) == "ref_space"
