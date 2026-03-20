"""Tests for memra.app.core.limiter — rate limiter configuration."""

from __future__ import annotations

from memra.app.core.limiter import limiter


class TestLimiter:
    def test_limiter_exists(self):
        assert limiter is not None

    def test_default_limits(self):
        assert limiter._default_limits is not None
