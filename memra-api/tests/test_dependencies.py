"""Tests for memra.app.core.dependencies — auth + role enforcement."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient

from memra.app.core.config import get_settings
from memra.app.core.db import get_db_conn
from memra.app.core.dependencies import (
    get_current_user,
    get_live_settings,
    require_role,
)
from tests.conftest import make_access_token, make_mock_session, make_test_settings


class TestGetCurrentUser:
    """Test the get_current_user dependency."""

    def test_valid_bearer_token(self):
        """With a valid JWT, returns decoded payload."""
        s = make_test_settings()
        user_id = str(uuid.uuid4())
        org_id = str(uuid.uuid4())
        token = make_access_token(s, user_id=user_id, org_id=org_id, role="admin")

        app = FastAPI()

        @app.get("/test")
        async def _test(user=Depends(get_current_user)):
            return {"sub": user["sub"], "role": user["role"]}

        async def _override_settings():
            return s

        app.dependency_overrides[get_live_settings] = _override_settings
        app.state.db_session_factory = None

        with TestClient(app) as client:
            resp = client.get("/test", headers={"Authorization": f"Bearer {token}"})

        assert resp.status_code == 200
        assert resp.json()["sub"] == user_id
        assert resp.json()["role"] == "admin"

    def test_missing_auth_header(self):
        s = make_test_settings()
        app = FastAPI()

        @app.get("/test")
        async def _test(user=Depends(get_current_user)):
            return user

        async def _override_settings():
            return s

        app.dependency_overrides[get_live_settings] = _override_settings
        app.state.db_session_factory = None

        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.get("/test")
        assert resp.status_code == 401
        assert "Authorization" in resp.json()["detail"]

    def test_malformed_auth_header(self):
        s = make_test_settings()
        app = FastAPI()

        @app.get("/test")
        async def _test(user=Depends(get_current_user)):
            return user

        async def _override_settings():
            return s

        app.dependency_overrides[get_live_settings] = _override_settings
        app.state.db_session_factory = None

        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.get("/test", headers={"Authorization": "Basic abc"})
        assert resp.status_code == 401

    def test_expired_token(self):
        s = make_test_settings(jwt_access_expiry_minutes=-1)
        token = make_access_token(s)

        app = FastAPI()

        @app.get("/test")
        async def _test(user=Depends(get_current_user)):
            return user

        async def _override_settings():
            return s

        app.dependency_overrides[get_live_settings] = _override_settings
        app.state.db_session_factory = None

        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.get("/test", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 401
        assert "expired" in resp.json()["detail"].lower()


class TestRequireRole:
    """Test the require_role dependency factory."""

    def _build_app(self, roles, user_role):
        s = make_test_settings()
        token = make_access_token(s, role=user_role)

        app = FastAPI()

        @app.get("/protected")
        async def _protected(user=Depends(require_role(*roles))):
            return {"role": user["role"]}

        async def _override_settings():
            return s

        app.dependency_overrides[get_live_settings] = _override_settings
        app.state.db_session_factory = None

        return app, token

    def test_owner_allowed_for_owner_route(self):
        app, token = self._build_app(("owner",), "owner")
        with TestClient(app) as client:
            resp = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["role"] == "owner"

    def test_admin_allowed_for_owner_admin_route(self):
        app, token = self._build_app(("owner", "admin"), "admin")
        with TestClient(app) as client:
            resp = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200

    def test_member_denied_for_owner_route(self):
        app, token = self._build_app(("owner",), "member")
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403
        assert "permissions" in resp.json()["detail"].lower()

    def test_member_denied_for_owner_admin_route(self):
        app, token = self._build_app(("owner", "admin"), "member")
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403

    def test_unauthenticated_returns_401(self):
        app, _ = self._build_app(("owner",), "owner")
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.get("/protected")
        assert resp.status_code == 401
