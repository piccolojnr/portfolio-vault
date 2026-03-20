"""Tests for memra.app.core.db — database engine utilities."""

from __future__ import annotations

import pytest

from memra.app.core.db import _make_async_url


class TestMakeAsyncUrl:
    def test_postgres_url(self):
        url = "postgresql://user:pass@localhost/db"
        assert _make_async_url(url) == "postgresql+asyncpg://user:pass@localhost/db"

    def test_already_async_url(self):
        url = "postgresql+asyncpg://user:pass@localhost/db"
        result = _make_async_url(url)
        # _make_async_url replaces "postgresql://" with "postgresql+asyncpg://".
        # When the input already has "+asyncpg", the substring "postgresql://" is
        # not present, so the URL passes through unchanged.
        assert result == url

    def test_non_postgres_url_unchanged(self):
        url = "sqlite:///test.db"
        assert _make_async_url(url) == url

    def test_full_url_with_params(self):
        url = "postgresql://user:pass@host:5432/db?sslmode=require"
        expected = "postgresql+asyncpg://user:pass@host:5432/db?sslmode=require"
        assert _make_async_url(url) == expected
