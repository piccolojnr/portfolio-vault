"""Tests for memra.app.core.config — Settings and computed fields."""

from __future__ import annotations

from pathlib import Path

import pytest

from tests.conftest import make_test_settings


class TestSettings:
    def test_use_demo_explicit(self):
        s = make_test_settings(demo_mode="1")
        assert s.use_demo is True

    def test_use_demo_no_keys(self):
        s = make_test_settings(
            demo_mode="",
            openai_api_key="",
            anthropic_api_key="",
        )
        assert s.use_demo is True

    def test_use_demo_false_with_openai(self):
        s = make_test_settings(
            demo_mode="",
            openai_api_key="sk-real",
            anthropic_api_key="",
        )
        assert s.use_demo is False

    def test_use_demo_false_with_anthropic(self):
        s = make_test_settings(
            demo_mode="",
            openai_api_key="",
            anthropic_api_key="sk-real",
        )
        assert s.use_demo is False

    def test_default_embedding_model(self):
        s = make_test_settings(embedding_model="text-embedding-3-small")
        assert s.embedding_model == "text-embedding-3-small"

    def test_default_storage_provider(self):
        s = make_test_settings()
        assert s.storage_provider == "local"

    def test_jwt_expiry_defaults(self):
        s = make_test_settings()
        assert s.jwt_access_expiry_minutes == 15
        assert s.jwt_refresh_expiry_days == 30

    def test_override_settings(self):
        s = make_test_settings(
            jwt_access_expiry_minutes=5,
            storage_provider="supabase",
        )
        assert s.jwt_access_expiry_minutes == 5
        assert s.storage_provider == "supabase"

    def test_paystack_keys(self):
        s = make_test_settings()
        assert s.paystack_secret_key == "sk_test_fake"
        assert s.paystack_public_key == "pk_test_fake"
        assert s.paystack_pro_plan_code == "PLN_pro_test"
        assert s.paystack_enterprise_plan_code == "PLN_ent_test"

    def test_neo4j_defaults(self):
        s = make_test_settings()
        assert s.neo4j_uri == ""
        assert s.neo4j_username == "neo4j"

    def test_environment_default(self):
        s = make_test_settings()
        assert s.environment == "development"
        assert s.is_production is False

    def test_production_environment(self):
        s = make_test_settings(environment="production")
        assert s.is_production is True
        assert s.cookie_secure is True
        assert s.cookie_samesite == "none"

    def test_cors_origins_default(self):
        s = make_test_settings(cors_origins="")
        assert s.allowed_origins == ["*"]

    def test_cors_origins_custom(self):
        s = make_test_settings(cors_origins="https://a.com,https://b.com")
        assert s.allowed_origins == ["https://a.com", "https://b.com"]
