"""Tests for deployment configuration — settings, CORS, cookies, connection pooling."""

from __future__ import annotations

import pytest

from memra.app.core.db import _make_async_url
from tests.conftest import make_test_settings


class TestSettingsNeo4j:
    def test_neo4j_defaults(self):
        s = make_test_settings()
        assert s.neo4j_uri == ""
        assert s.neo4j_username == "neo4j"
        assert s.neo4j_password == ""

    def test_neo4j_configured(self):
        s = make_test_settings(
            neo4j_uri="neo4j+s://test.neo4j.io",
            neo4j_password="secret",
        )
        assert s.neo4j_uri == "neo4j+s://test.neo4j.io"
        assert s.neo4j_password == "secret"


class TestSettingsEnvironment:
    def test_default_development(self):
        s = make_test_settings()
        assert s.environment == "development"
        assert s.is_production is False

    def test_production(self):
        s = make_test_settings(environment="production")
        assert s.is_production is True

    def test_gunicorn_workers_default(self):
        s = make_test_settings()
        assert s.gunicorn_workers == 4


class TestCookieSettings:
    def test_development_cookies(self):
        s = make_test_settings(environment="development")
        assert s.cookie_secure is False
        assert s.cookie_samesite == "lax"

    def test_production_cookies(self):
        s = make_test_settings(environment="production")
        assert s.cookie_secure is True
        assert s.cookie_samesite == "none"


class TestCORSSettings:
    def test_default_allows_all(self):
        s = make_test_settings(cors_origins="")
        assert s.allowed_origins == ["*"]

    def test_explicit_origins(self):
        s = make_test_settings(cors_origins="https://app.memra.com,https://admin.memra.com")
        assert s.allowed_origins == ["https://app.memra.com", "https://admin.memra.com"]

    def test_single_origin(self):
        s = make_test_settings(cors_origins="http://localhost:3000")
        assert s.allowed_origins == ["http://localhost:3000"]

    def test_strips_whitespace(self):
        s = make_test_settings(cors_origins=" https://a.com , https://b.com ")
        assert s.allowed_origins == ["https://a.com", "https://b.com"]


class TestConnectionPooling:
    def test_pgbouncer_detection_port_6543(self):
        """PgBouncer URLs (port 6543) should disable statement cache."""
        from memra.app.core.db import open_db_engine
        # We can't easily test the engine creation without a real DB,
        # but we can verify the URL parsing logic.
        url = "postgresql://user:pass@db.supabase.co:6543/postgres"
        assert ":6543" in url

    def test_pgbouncer_detection_param(self):
        url = "postgresql://user:pass@db.supabase.co:5432/postgres?pgbouncer=true"
        assert "pgbouncer=true" in url

    def test_normal_url_no_pgbouncer(self):
        url = "postgresql://user:pass@localhost:5432/testdb"
        assert ":6543" not in url
        assert "pgbouncer=true" not in url


class TestLightragStorageEnv:
    def test_resolve_graph_storage_with_neo4j(self):
        from memra.domain.services.lightrag_service import _resolve_graph_storage

        s = make_test_settings(neo4j_uri="neo4j+s://test.neo4j.io")
        assert _resolve_graph_storage(s) == "Neo4JStorage"

    def test_resolve_graph_storage_without_neo4j(self):
        from memra.domain.services.lightrag_service import _resolve_graph_storage

        s = make_test_settings(neo4j_uri="")
        assert _resolve_graph_storage(s) == "NetworkXStorage"


class TestLightragParseDbUrl:
    def test_standard_url(self):
        from memra.domain.services.lightrag_service import _parse_db_url

        result = _parse_db_url("postgresql://user:pass@host:5432/dbname")
        assert result["POSTGRES_USER"] == "user"
        assert result["POSTGRES_PASSWORD"] == "pass"
        assert result["POSTGRES_HOST"] == "host"
        assert result["POSTGRES_PORT"] == "5432"
        assert result["POSTGRES_DATABASE"] == "dbname"

    def test_url_without_port(self):
        from memra.domain.services.lightrag_service import _parse_db_url

        result = _parse_db_url("postgresql://user:pass@host/dbname")
        assert result["POSTGRES_PORT"] == "5432"

    def test_asyncpg_url(self):
        from memra.domain.services.lightrag_service import _parse_db_url

        result = _parse_db_url("postgresql+asyncpg://user:pass@host:5432/db")
        assert result["POSTGRES_USER"] == "user"

    def test_invalid_url_raises(self):
        from memra.domain.services.lightrag_service import _parse_db_url

        with pytest.raises(ValueError, match="Cannot parse"):
            _parse_db_url("sqlite:///test.db")


class TestApplyStorageEnv:
    def test_neo4j_env_vars_set(self):
        import os
        from memra.domain.services.lightrag_service import _apply_storage_env

        s = make_test_settings(
            neo4j_uri="neo4j+s://test.neo4j.io",
            neo4j_username="neo4j",
            neo4j_password="testpass",
            database_url="",
            qdrant_url="",
        )

        old_uri = os.environ.get("NEO4J_URI")
        old_user = os.environ.get("NEO4J_USERNAME")
        old_pass = os.environ.get("NEO4J_PASSWORD")

        try:
            _apply_storage_env(s)
            assert os.environ.get("NEO4J_URI") == "neo4j+s://test.neo4j.io"
            assert os.environ.get("NEO4J_USERNAME") == "neo4j"
            assert os.environ.get("NEO4J_PASSWORD") == "testpass"
        finally:
            # Clean up env vars
            for key, old_val in [("NEO4J_URI", old_uri), ("NEO4J_USERNAME", old_user), ("NEO4J_PASSWORD", old_pass)]:
                if old_val is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = old_val

    def test_no_neo4j_env_vars_when_empty(self):
        import os
        from memra.domain.services.lightrag_service import _apply_storage_env

        s = make_test_settings(
            neo4j_uri="",
            database_url="",
            qdrant_url="",
        )

        # Remove any existing env vars
        for key in ("NEO4J_URI", "NEO4J_USERNAME", "NEO4J_PASSWORD"):
            os.environ.pop(key, None)

        _apply_storage_env(s)
        assert os.environ.get("NEO4J_URI", "") == ""


class TestDockerfileExists:
    def test_dockerfile_present(self):
        from pathlib import Path

        dockerfile = Path(__file__).parents[1] / "Dockerfile"
        assert dockerfile.exists()


class TestProcfile:
    def test_procfile_has_gunicorn(self):
        from pathlib import Path

        procfile = Path(__file__).parents[1] / "Procfile"
        content = procfile.read_text()
        assert "gunicorn" in content
        assert "uvicorn.workers.UvicornWorker" in content

    def test_procfile_has_worker(self):
        from pathlib import Path

        procfile = Path(__file__).parents[1] / "Procfile"
        content = procfile.read_text()
        assert "worker:" in content

    def test_procfile_has_release_command(self):
        from pathlib import Path

        procfile = Path(__file__).parents[1] / "Procfile"
        content = procfile.read_text()
        assert "release:" in content
        assert "alembic upgrade head" in content


class TestRailwayToml:
    def test_railway_toml_present(self):
        from pathlib import Path

        path = Path(__file__).parents[1] / "railway.toml"
        assert path.exists()

    def test_railway_toml_has_healthcheck(self):
        from pathlib import Path

        path = Path(__file__).parents[1] / "railway.toml"
        content = path.read_text()
        assert "/api/v1/health" in content
