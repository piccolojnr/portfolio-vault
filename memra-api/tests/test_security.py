"""Tests for memra.app.core.security — JWT creation and verification."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import jwt as pyjwt
import pytest

from memra.app.core.security import (
    InvalidTokenError,
    create_access_token,
    create_refresh_token,
    hash_token,
    verify_access_token,
)
from tests.conftest import make_test_settings


class TestCreateAccessToken:
    def setup_method(self):
        self.settings = make_test_settings()
        self.user_id = str(uuid.uuid4())
        self.org_id = str(uuid.uuid4())

    def test_returns_string(self):
        token = create_access_token(
            self.user_id, self.org_id, "owner", "a@b.com", self.settings,
        )
        assert isinstance(token, str)

    def test_contains_expected_claims(self):
        token = create_access_token(
            self.user_id, self.org_id, "admin", "a@b.com", self.settings,
            org_name="TestOrg",
            display_name="Alice",
        )
        payload = pyjwt.decode(token, self.settings.jwt_secret, algorithms=["HS256"])
        assert payload["sub"] == self.user_id
        assert payload["org_id"] == self.org_id
        assert payload["role"] == "admin"
        assert payload["email"] == "a@b.com"
        assert payload["org_name"] == "TestOrg"
        assert payload["display_name"] == "Alice"
        assert payload["type"] == "access"

    def test_expiry_based_on_settings(self):
        settings = make_test_settings(jwt_access_expiry_minutes=60)
        token = create_access_token(
            self.user_id, self.org_id, "member", "x@y.com", settings,
        )
        payload = pyjwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        iat = datetime.fromtimestamp(payload["iat"], tz=timezone.utc)
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        assert (exp - iat).total_seconds() == pytest.approx(3600, abs=5)

    def test_email_verified_defaults_true(self):
        token = create_access_token(
            self.user_id, self.org_id, "member", "x@y.com", self.settings,
        )
        payload = pyjwt.decode(token, self.settings.jwt_secret, algorithms=["HS256"])
        assert payload["email_verified"] is True

    def test_email_verified_false(self):
        token = create_access_token(
            self.user_id, self.org_id, "member", "x@y.com", self.settings,
            email_verified=False,
        )
        payload = pyjwt.decode(token, self.settings.jwt_secret, algorithms=["HS256"])
        assert payload["email_verified"] is False

    def test_onboarding_completed_at_string(self):
        ts = "2024-01-15T10:30:00"
        token = create_access_token(
            self.user_id, self.org_id, "owner", "x@y.com", self.settings,
            onboarding_completed_at=ts,
        )
        payload = pyjwt.decode(token, self.settings.jwt_secret, algorithms=["HS256"])
        assert payload["onboarding_completed_at"] == ts

    def test_onboarding_completed_at_datetime(self):
        dt = datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)
        token = create_access_token(
            self.user_id, self.org_id, "owner", "x@y.com", self.settings,
            onboarding_completed_at=dt,
        )
        payload = pyjwt.decode(token, self.settings.jwt_secret, algorithms=["HS256"])
        assert payload["onboarding_completed_at"] is not None

    def test_onboarding_completed_at_none(self):
        token = create_access_token(
            self.user_id, self.org_id, "owner", "x@y.com", self.settings,
        )
        payload = pyjwt.decode(token, self.settings.jwt_secret, algorithms=["HS256"])
        assert payload["onboarding_completed_at"] is None


class TestVerifyAccessToken:
    def setup_method(self):
        self.settings = make_test_settings()

    def test_valid_token(self):
        token = create_access_token(
            str(uuid.uuid4()), str(uuid.uuid4()), "owner", "a@b.com", self.settings,
        )
        payload = verify_access_token(token, self.settings)
        assert payload["type"] == "access"
        assert payload["email"] == "a@b.com"

    def test_expired_token(self):
        settings = make_test_settings(jwt_access_expiry_minutes=-1)
        token = create_access_token(
            str(uuid.uuid4()), str(uuid.uuid4()), "owner", "a@b.com", settings,
        )
        with pytest.raises(InvalidTokenError, match="expired"):
            verify_access_token(token, settings)

    def test_wrong_secret_raises(self):
        token = create_access_token(
            str(uuid.uuid4()), str(uuid.uuid4()), "owner", "a@b.com", self.settings,
        )
        wrong_settings = make_test_settings(jwt_secret="wrong-secret-key")
        with pytest.raises(InvalidTokenError, match="invalid"):
            verify_access_token(token, wrong_settings)

    def test_wrong_token_type_raises(self):
        now = datetime.now(timezone.utc)
        payload = {
            "sub": str(uuid.uuid4()),
            "type": "refresh",
            "iat": now,
            "exp": now + timedelta(hours=1),
        }
        token = pyjwt.encode(payload, self.settings.jwt_secret, algorithm="HS256")
        with pytest.raises(InvalidTokenError, match="Wrong token type"):
            verify_access_token(token, self.settings)

    def test_garbage_token(self):
        with pytest.raises(InvalidTokenError, match="invalid"):
            verify_access_token("not.a.jwt", self.settings)

    def test_missing_sub_claim(self):
        from jwt.exceptions import MissingRequiredClaimError

        now = datetime.now(timezone.utc)
        payload = {
            "type": "access",
            "iat": now,
            "exp": now + timedelta(hours=1),
        }
        token = pyjwt.encode(payload, self.settings.jwt_secret, algorithm="HS256")
        # PyJWT raises MissingRequiredClaimError (not caught by DecodeError).
        # This bubbles up as an unhandled error — verify the behavior:
        with pytest.raises(MissingRequiredClaimError):
            verify_access_token(token, self.settings)


class TestCreateRefreshToken:
    def test_returns_tuple_of_two_strings(self):
        raw, hashed = create_refresh_token()
        assert isinstance(raw, str)
        assert isinstance(hashed, str)

    def test_raw_and_hash_differ(self):
        raw, hashed = create_refresh_token()
        assert raw != hashed

    def test_raw_is_hex_64_chars(self):
        raw, _ = create_refresh_token()
        assert len(raw) == 64
        int(raw, 16)  # should not raise

    def test_hash_is_sha256(self):
        raw, hashed = create_refresh_token()
        assert hashed == hash_token(raw)

    def test_different_each_call(self):
        r1, h1 = create_refresh_token()
        r2, h2 = create_refresh_token()
        assert r1 != r2
        assert h1 != h2


class TestHashToken:
    def test_deterministic(self):
        assert hash_token("hello") == hash_token("hello")

    def test_different_inputs_differ(self):
        assert hash_token("a") != hash_token("b")

    def test_returns_hex_string(self):
        result = hash_token("test")
        assert len(result) == 64
        int(result, 16)  # valid hex
