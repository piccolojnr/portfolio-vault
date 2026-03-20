"""Tests for /api/v1/auth endpoints."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from memra.app.core.config import get_settings
from memra.app.core.db import get_db_conn
from memra.app.core.dependencies import get_current_user, get_live_settings
from memra.app.main import create_app
from tests.conftest import FakeExecuteResult, make_mock_session, make_test_settings


def _make_auth_app(
    *,
    settings=None,
    user_payload=None,
    mock_session=None,
):
    """Build a test app with full control over dependency overrides."""
    app = create_app()
    s = settings or make_test_settings()
    session = mock_session or make_mock_session()

    async def _override_db():
        yield session

    app.dependency_overrides[get_settings] = lambda: s
    app.dependency_overrides[get_live_settings] = lambda: s
    app.dependency_overrides[get_db_conn] = _override_db

    if user_payload:
        app.dependency_overrides[get_current_user] = lambda: user_payload

    app.state.db_engine = None
    app.state.db_session_factory = None

    return app


class TestRegister:
    @patch("memra.domain.services.auth_service.register")
    def test_register_success(self, mock_register):
        from memra.infrastructure.db.models.user import User

        user = MagicMock(spec=User)
        mock_register.return_value = (user, "access_tok_abc", "refresh_tok_raw")
        mock_register.__wrapped__ = None

        app = _make_auth_app()
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/api/v1/auth/register",
                json={"email": "new@user.com", "password": "secr3t!"},
            )
        assert resp.status_code == 201
        data = resp.json()
        assert data["access_token"] == "access_tok_abc"
        assert data["token_type"] == "bearer"

    @patch("memra.domain.services.auth_service.register")
    def test_register_conflict(self, mock_register):
        mock_register.side_effect = ValueError("Email already registered")
        mock_register.__wrapped__ = None

        app = _make_auth_app()
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/api/v1/auth/register",
                json={"email": "dup@user.com", "password": "pass"},
            )
        assert resp.status_code == 409
        assert "already registered" in resp.json()["detail"].lower()


class TestLogin:
    @patch("memra.domain.services.auth_service.login")
    def test_login_success(self, mock_login):
        mock_login.return_value = ("access_tok_xyz", "refresh_raw")
        mock_login.__wrapped__ = None

        app = _make_auth_app()
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/api/v1/auth/login",
                json={"email": "user@example.com", "password": "pass123"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["access_token"] == "access_tok_xyz"

    @patch("memra.domain.services.auth_service.login")
    def test_login_invalid_credentials(self, mock_login):
        mock_login.side_effect = ValueError("Invalid")
        mock_login.__wrapped__ = None

        app = _make_auth_app()
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/api/v1/auth/login",
                json={"email": "bad@user.com", "password": "wrong"},
            )
        assert resp.status_code == 401

    @patch("memra.domain.services.auth_service.login")
    def test_login_user_not_found(self, mock_login):
        mock_login.side_effect = LookupError("Not found")
        mock_login.__wrapped__ = None

        app = _make_auth_app()
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/api/v1/auth/login",
                json={"email": "ghost@user.com", "password": "pass"},
            )
        assert resp.status_code == 401


class TestRefresh:
    @patch("memra.domain.services.auth_service.refresh")
    def test_refresh_success(self, mock_refresh):
        mock_refresh.return_value = ("new_access_tok", "new_refresh_raw")
        mock_refresh.__wrapped__ = None

        app = _make_auth_app()
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/api/v1/auth/refresh",
                cookies={"refresh_token": "old_refresh_raw"},
            )
        assert resp.status_code == 200
        assert resp.json()["access_token"] == "new_access_tok"

    def test_refresh_missing_cookie(self):
        app = _make_auth_app()
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post("/api/v1/auth/refresh")
        assert resp.status_code == 401
        assert "refresh token" in resp.json()["detail"].lower()

    @patch("memra.domain.services.auth_service.refresh")
    def test_refresh_invalid_token(self, mock_refresh):
        mock_refresh.side_effect = ValueError("Token expired or revoked")
        mock_refresh.__wrapped__ = None

        app = _make_auth_app()
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/api/v1/auth/refresh",
                cookies={"refresh_token": "expired_token"},
            )
        assert resp.status_code == 401


class TestLogout:
    @patch("memra.domain.services.auth_service.logout")
    def test_logout_with_cookie(self, mock_logout):
        mock_logout.return_value = None
        mock_logout.__wrapped__ = None

        app = _make_auth_app()
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/api/v1/auth/logout",
                cookies={"refresh_token": "some_token"},
            )
        assert resp.status_code == 204

    def test_logout_without_cookie(self):
        app = _make_auth_app()
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post("/api/v1/auth/logout")
        assert resp.status_code == 204


class TestMagicLink:
    @patch("memra.domain.services.auth_service.send_magic_link")
    def test_request_magic_link(self, mock_send):
        mock_send.return_value = None
        mock_send.__wrapped__ = None

        app = _make_auth_app()
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/api/v1/auth/magic-link",
                json={"email": "user@test.com"},
            )
        assert resp.status_code == 200
        assert "magic link" in resp.json()["message"].lower()

    @patch("memra.domain.services.auth_service.send_magic_link")
    def test_rate_limited(self, mock_send):
        mock_send.side_effect = ValueError("Rate limited")
        mock_send.__wrapped__ = None

        app = _make_auth_app()
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/api/v1/auth/magic-link",
                json={"email": "user@test.com"},
            )
        assert resp.status_code == 429


class TestPasswordReset:
    @patch("memra.domain.services.auth_service.send_password_reset")
    def test_request_password_reset(self, mock_send):
        mock_send.return_value = None
        mock_send.__wrapped__ = None

        app = _make_auth_app()
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/api/v1/auth/password-reset",
                json={"email": "user@test.com"},
            )
        assert resp.status_code == 200
        assert "reset link" in resp.json()["message"].lower()

    @patch("memra.domain.services.auth_service.reset_password")
    def test_confirm_password_reset_success(self, mock_reset):
        mock_reset.return_value = None
        mock_reset.__wrapped__ = None

        app = _make_auth_app()
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/api/v1/auth/password-reset/confirm",
                json={"token": "valid_tok", "new_password": "newpass123"},
            )
        assert resp.status_code == 200

    @patch("memra.domain.services.auth_service.reset_password")
    def test_confirm_password_reset_invalid_token(self, mock_reset):
        mock_reset.side_effect = ValueError("Invalid or expired token")
        mock_reset.__wrapped__ = None

        app = _make_auth_app()
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/api/v1/auth/password-reset/confirm",
                json={"token": "bad_tok", "new_password": "newpass"},
            )
        assert resp.status_code == 400


class TestMeEndpoint:
    def test_me_unauthenticated(self):
        """Without auth override, /me should require a Bearer token."""
        app = _make_auth_app()
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.get("/api/v1/auth/me")
        assert resp.status_code == 401
