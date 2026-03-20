"""Tests for root and health endpoints."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from memra.app.core.config import get_settings
from memra.app.core.db import get_db_conn
from memra.app.core.dependencies import get_client, get_current_user, get_live_settings
from memra.app.main import create_app
from tests.conftest import make_mock_session, make_test_settings


def _health_app():
    """Build an app with a mocked Qdrant client for health tests.

    We patch ``get_settings`` at the **module** level (lru_cache) so the
    lifespan sees ``database_url=""`` and skips DB connection.  Dependency
    overrides alone are not enough because the lifespan calls the cached
    function directly, not through FastAPI's DI.
    """
    s = make_test_settings(qdrant_url="", database_url="", storage_provider="local")

    mock_qdrant = MagicMock()
    count_result = MagicMock()
    count_result.count = 42
    mock_qdrant.count.return_value = count_result

    mock_session = make_mock_session()

    async def _override_db():
        yield mock_session

    # Patch the lru_cache so lifespan sees database_url=""
    with patch("memra.app.main.get_settings", return_value=s), \
         patch("memra.app.core.dependencies.get_settings", return_value=s):
        app = create_app()

    app.dependency_overrides[get_settings] = lambda: s
    app.dependency_overrides[get_live_settings] = lambda: s
    app.dependency_overrides[get_client] = lambda: mock_qdrant
    app.dependency_overrides[get_db_conn] = _override_db

    return app


class TestRootEndpoint:
    def test_root_returns_api_info(self, client):
        resp = client.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Memra API"
        assert "endpoints" in data
        assert "health" in data["endpoints"]

    def test_root_has_description(self, client):
        resp = client.get("/")
        data = resp.json()
        assert "Memra" in data["description"]


class TestHealthEndpoint:
    def _get_health(self):
        s = make_test_settings(qdrant_url="", database_url="", storage_provider="local", neo4j_uri="")

        mock_qdrant = MagicMock()
        count_result = MagicMock()
        count_result.count = 42
        mock_qdrant.count.return_value = count_result

        mock_session = make_mock_session()

        async def _override_db():
            yield mock_session

        with patch("memra.app.main.get_settings", return_value=s), \
             patch("memra.app.core.dependencies.get_settings", return_value=s):
            app = create_app()

        app.dependency_overrides[get_settings] = lambda: s
        app.dependency_overrides[get_live_settings] = lambda: s
        app.dependency_overrides[get_client] = lambda: mock_qdrant
        app.dependency_overrides[get_db_conn] = _override_db

        with TestClient(app, raise_server_exceptions=False) as client:
            return client.get("/api/v1/health")

    def test_health_returns_200(self):
        """Health endpoint should return 200 with mocked services."""
        resp = self._get_health()
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data
        assert "qdrant" in data
        assert "database" in data
        assert "storage" in data
        assert "paystack" in data
        assert data["paystack"]["status"] in ("ok", "not_configured")

    def test_health_database_not_configured(self):
        """When no DB is configured, database status should say so."""
        resp = self._get_health()
        data = resp.json()
        assert data["database"]["status"] == "not_configured"

    def test_health_has_demo_mode(self):
        resp = self._get_health()
        data = resp.json()
        assert "demo_mode" in data

    def test_health_includes_neo4j(self):
        resp = self._get_health()
        data = resp.json()
        assert "neo4j" in data
        assert data["neo4j"]["status"] == "not_configured"
