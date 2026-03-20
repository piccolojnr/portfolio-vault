"""Tests for memra.app.core.platform_auth — platform admin JWT and rate limiting."""

from __future__ import annotations

import time
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import jwt as pyjwt
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from memra.app.core.platform_auth import (
    InvalidAdminTokenError,
    MAX_ATTEMPTS,
    WINDOW_SECONDS,
    check_login_rate_limit,
    clear_login_attempts,
    create_admin_access_token,
    create_admin_refresh_token,
    get_platform_admin,
    hash_token,
    record_failed_login,
    verify_admin_access_token,
)
from tests.conftest import make_test_settings


class TestCreateAdminAccessToken:
    def test_returns_string(self):
        s = make_test_settings()
        token = create_admin_access_token("admin1", "admin@test.com", "Admin", s)
        assert isinstance(token, str)

    def test_contains_platform_admin_type(self):
        s = make_test_settings()
        token = create_admin_access_token("admin1", "admin@test.com", "Admin", s)
        secret = s.admin_jwt_secret or s.jwt_secret
        payload = pyjwt.decode(token, secret, algorithms=["HS256"])
        assert payload["type"] == "platform_admin"
        assert payload["sub"] == "admin1"
        assert payload["email"] == "admin@test.com"

    def test_fallback_to_jwt_secret(self):
        s = make_test_settings(admin_jwt_secret="")
        token = create_admin_access_token("a1", "a@b.com", "A", s)
        payload = pyjwt.decode(token, s.jwt_secret, algorithms=["HS256"])
        assert payload["type"] == "platform_admin"


class TestVerifyAdminAccessToken:
    def test_valid_token(self):
        s = make_test_settings()
        token = create_admin_access_token("admin1", "a@b.com", "Admin", s)
        payload = verify_admin_access_token(token, s)
        assert payload["sub"] == "admin1"
        assert payload["type"] == "platform_admin"

    def test_expired_token(self):
        s = make_test_settings()
        secret = s.admin_jwt_secret or s.jwt_secret
        now = datetime.now(timezone.utc)
        payload = {
            "sub": "a1",
            "email": "a@b.com",
            "name": "A",
            "type": "platform_admin",
            "iat": now - timedelta(hours=2),
            "exp": now - timedelta(hours=1),
        }
        token = pyjwt.encode(payload, secret, algorithm="HS256")
        with pytest.raises(InvalidAdminTokenError, match="expired"):
            verify_admin_access_token(token, s)

    def test_wrong_type_rejected(self):
        s = make_test_settings()
        secret = s.admin_jwt_secret or s.jwt_secret
        now = datetime.now(timezone.utc)
        payload = {
            "sub": "user1",
            "type": "access",
            "iat": now,
            "exp": now + timedelta(hours=1),
        }
        token = pyjwt.encode(payload, secret, algorithm="HS256")
        with pytest.raises(InvalidAdminTokenError, match="Not a platform admin"):
            verify_admin_access_token(token, s)

    def test_invalid_token(self):
        s = make_test_settings()
        with pytest.raises(InvalidAdminTokenError, match="invalid"):
            verify_admin_access_token("garbage.token.here", s)


class TestCreateAdminRefreshToken:
    def test_returns_tuple(self):
        raw, hashed = create_admin_refresh_token()
        assert isinstance(raw, str)
        assert isinstance(hashed, str)
        assert len(raw) == 64
        assert len(hashed) == 64

    def test_hash_matches(self):
        raw, hashed = create_admin_refresh_token()
        assert hash_token(raw) == hashed


class TestGetPlatformAdmin:
    def test_valid_admin_token(self):
        s = make_test_settings()
        token = create_admin_access_token("admin1", "admin@test.com", "Admin", s)

        app = FastAPI()

        @app.get("/test")
        async def _test(admin=Depends(get_platform_admin)):
            return {"sub": admin["sub"]}

        from memra.app.core.config import get_settings
        app.dependency_overrides[get_settings] = lambda: s

        with TestClient(app) as client:
            resp = client.get("/test", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["sub"] == "admin1"

    def test_org_user_token_rejected(self):
        s = make_test_settings()
        from memra.app.core.security import create_access_token

        org_token = create_access_token("user1", "org1", "owner", "u@t.com", s)

        app = FastAPI()

        @app.get("/test")
        async def _test(admin=Depends(get_platform_admin)):
            return admin

        from memra.app.core.config import get_settings
        app.dependency_overrides[get_settings] = lambda: s

        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.get("/test", headers={"Authorization": f"Bearer {org_token}"})
        assert resp.status_code == 401

    def test_missing_header(self):
        s = make_test_settings()
        app = FastAPI()

        @app.get("/test")
        async def _test(admin=Depends(get_platform_admin)):
            return admin

        from memra.app.core.config import get_settings
        app.dependency_overrides[get_settings] = lambda: s

        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.get("/test")
        assert resp.status_code == 401


class TestLoginRateLimiter:
    def setup_method(self):
        from memra.app.core import platform_auth
        platform_auth._login_attempts.clear()

    def test_under_limit_allowed(self):
        for i in range(MAX_ATTEMPTS - 1):
            record_failed_login("1.2.3.4")
        check_login_rate_limit("1.2.3.4")  # should not raise

    def test_at_limit_raises_429(self):
        from fastapi import HTTPException

        for i in range(MAX_ATTEMPTS):
            record_failed_login("1.2.3.4")
        with pytest.raises(HTTPException) as exc_info:
            check_login_rate_limit("1.2.3.4")
        assert exc_info.value.status_code == 429

    def test_clear_resets_counter(self):
        for i in range(MAX_ATTEMPTS):
            record_failed_login("1.2.3.4")
        clear_login_attempts("1.2.3.4")
        check_login_rate_limit("1.2.3.4")  # should not raise

    def test_different_ips_independent(self):
        from fastapi import HTTPException

        for i in range(MAX_ATTEMPTS):
            record_failed_login("1.1.1.1")
        with pytest.raises(HTTPException):
            check_login_rate_limit("1.1.1.1")
        check_login_rate_limit("2.2.2.2")  # different IP, should work
