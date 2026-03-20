"""Tests for infrastructure DB models — schema validation and defaults."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest

from memra.infrastructure.db.models.base import utcnow


class TestUtcnow:
    def test_returns_naive_datetime(self):
        result = utcnow()
        assert isinstance(result, datetime)
        assert result.tzinfo is None

    def test_close_to_now(self):
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        result = utcnow()
        diff = abs((result - now).total_seconds())
        assert diff < 2


class TestUserModel:
    def test_create_user(self):
        from memra.infrastructure.db.models.user import User

        u = User(
            email="test@example.com",
            password_hash="hashed_pw",
            email_verified=False,
        )
        assert u.email == "test@example.com"
        assert u.disabled is False
        assert u.display_name is None

    def test_user_defaults(self):
        from memra.infrastructure.db.models.user import User

        u = User(email="x@y.com")
        assert u.email_verified is False
        assert u.disabled is False
        assert u.use_case is None


class TestOrganisationModel:
    def test_create_org(self):
        from memra.infrastructure.db.models.org import Organisation

        org = Organisation(name="Test Org", slug="test-org")
        assert org.plan == "free"
        assert org.plan_source == "self_service"
        assert org.active_corpus_id is None

    def test_org_with_plan(self):
        from memra.infrastructure.db.models.org import Organisation

        org = Organisation(name="Pro Org", slug="pro-org", plan="pro", plan_source="self_service")
        assert org.plan == "pro"


class TestOrganisationMemberModel:
    def test_create_member(self):
        from memra.infrastructure.db.models.org import OrganisationMember

        m = OrganisationMember(
            user_id=uuid.uuid4(),
            org_id=uuid.uuid4(),
            role="admin",
        )
        assert m.role == "admin"

    def test_default_role(self):
        from memra.infrastructure.db.models.org import OrganisationMember

        m = OrganisationMember(user_id=uuid.uuid4(), org_id=uuid.uuid4())
        assert m.role == "member"


class TestOrganisationInviteModel:
    def test_create_invite(self):
        from memra.infrastructure.db.models.org import OrganisationInvite

        inv = OrganisationInvite(
            org_id=uuid.uuid4(),
            email="invited@test.com",
            token_hash="abc123" + "0" * 58,
            expires_at=datetime(2026, 12, 31),
        )
        assert inv.accepted is False
        assert inv.role == "member"


class TestSubscriptionModel:
    def test_create_subscription(self):
        from memra.infrastructure.db.models.subscription import Subscription

        sub = Subscription(
            org_id=uuid.uuid4(),
            paystack_subscription_code="SUB_test",
        )
        assert sub.status == "active"
        assert sub.cancelled_at is None
        assert sub.current_period_start is None


class TestPaymentEventModel:
    def test_create_payment_event(self):
        from memra.infrastructure.db.models.payment_event import PaymentEvent

        pe = PaymentEvent(
            paystack_event="charge.success",
            paystack_reference="ref_123",
            raw_payload={"event": "charge.success"},
        )
        assert pe.processed is False
        assert pe.error is None
        assert pe.org_id is None


class TestPlanLimitModel:
    def test_create_plan_limit(self):
        from memra.infrastructure.db.models.plan_limit import PlanLimit

        pl = PlanLimit(
            plan_tier="pro",
            monthly_token_limit=5_000_000,
            max_documents=500,
            max_corpora=10,
            max_members=25,
        )
        assert pl.plan_tier == "pro"
        assert pl.monthly_token_limit == 5_000_000

    def test_unlimited_fields(self):
        from memra.infrastructure.db.models.plan_limit import PlanLimit

        pl = PlanLimit(plan_tier="enterprise")
        assert pl.monthly_token_limit is None
        assert pl.max_documents is None


class TestModelPlanRestrictionModel:
    def test_create_restriction(self):
        from memra.infrastructure.db.models.model_plan_restriction import ModelPlanRestriction

        r = ModelPlanRestriction(
            model_id="claude-sonnet-4-6",
            model_name="Claude Sonnet 4.6",
            model_type="chat",
            provider="anthropic",
            min_plan="pro",
        )
        assert r.min_plan == "pro"
        assert r.enabled is True

    def test_defaults(self):
        from memra.infrastructure.db.models.model_plan_restriction import ModelPlanRestriction

        r = ModelPlanRestriction(
            model_id="gpt-4o-mini",
            model_name="GPT-4o Mini",
            model_type="chat",
            provider="openai",
        )
        assert r.min_plan == "free"
        assert r.enabled is True


class TestOrganisationSettingModel:
    def test_create_setting(self):
        from memra.infrastructure.db.models.org import OrganisationSetting

        s = OrganisationSetting(
            org_id=uuid.uuid4(),
            key="anthropic_model",
            value="claude-sonnet-4-6",
        )
        assert s.is_secret is False
        assert s.value == "claude-sonnet-4-6"
