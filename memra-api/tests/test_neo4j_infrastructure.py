"""Tests for memra.infrastructure.neo4j — driver management and graph queries."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from memra.infrastructure.neo4j import (
    close_neo4j_driver,
    fetch_graph_for_workspace,
    neo4j_health_check,
    open_neo4j_driver,
)
from tests.conftest import make_test_settings


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _make_mock_driver(session_mock):
    """Build a mock Neo4j driver whose .session() returns an async context manager."""
    driver = MagicMock()

    @asynccontextmanager
    async def _session():
        yield session_mock

    driver.session = _session
    return driver


class TestOpenNeo4jDriver:
    def test_returns_none_when_no_uri(self):
        s = make_test_settings(neo4j_uri="")
        result = _run(open_neo4j_driver(s))
        assert result is None

    def test_returns_driver_when_uri_set(self):
        s = make_test_settings(neo4j_uri="neo4j+s://test.neo4j.io", neo4j_password="pass")
        mock_driver = MagicMock()
        mock_driver.verify_connectivity = AsyncMock()

        with patch("neo4j.AsyncGraphDatabase.driver", return_value=mock_driver):
            result = _run(open_neo4j_driver(s))

        assert result is mock_driver
        mock_driver.verify_connectivity.assert_awaited_once()

    def test_returns_driver_even_on_connectivity_failure(self):
        s = make_test_settings(neo4j_uri="neo4j+s://bad.host", neo4j_password="p")
        mock_driver = MagicMock()
        mock_driver.verify_connectivity = AsyncMock(side_effect=Exception("refused"))

        with patch("neo4j.AsyncGraphDatabase.driver", return_value=mock_driver):
            result = _run(open_neo4j_driver(s))

        # Driver is returned even when connectivity check fails
        assert result is mock_driver


class TestCloseNeo4jDriver:
    def test_close_driver(self):
        mock_driver = AsyncMock()
        _run(close_neo4j_driver(mock_driver))
        mock_driver.close.assert_awaited_once()

    def test_close_none_is_noop(self):
        _run(close_neo4j_driver(None))

    def test_close_exception_swallowed(self):
        mock_driver = AsyncMock()
        mock_driver.close = AsyncMock(side_effect=Exception("already closed"))
        _run(close_neo4j_driver(mock_driver))


class TestNeo4jHealthCheck:
    def test_ok(self):
        mock_session = AsyncMock()
        mock_result = AsyncMock()
        mock_result.single = AsyncMock(return_value={"n": 1})
        mock_session.run = AsyncMock(return_value=mock_result)

        driver = _make_mock_driver(mock_session)
        result = _run(neo4j_health_check(driver))
        assert result == "ok"

    def test_not_configured(self):
        result = _run(neo4j_health_check(None))
        assert result == "not_configured"

    def test_error_returns_string(self):
        mock_session = AsyncMock()
        mock_session.run = AsyncMock(side_effect=Exception("timeout"))

        driver = _make_mock_driver(mock_session)
        result = _run(neo4j_health_check(driver))
        assert "timeout" in result


class TestFetchGraphForWorkspace:
    def test_returns_empty_when_no_driver(self):
        result = _run(fetch_graph_for_workspace(None, "test_corpus"))
        assert result == {"nodes": [], "links": []}

    def test_returns_nodes_and_links(self):
        node_records = [
            {"entity_id": "Alice", "entity_type": "PERSON", "description": "A person", "eid": "1"},
            {"entity_id": "Bob", "entity_type": "PERSON", "description": "Another", "eid": "2"},
        ]
        rel_records = [
            {"source": "Alice", "target": "Bob", "description": "knows", "keywords": None},
        ]

        call_count = 0
        mock_session = AsyncMock()

        async def _mock_run(query):
            nonlocal call_count
            call_count += 1
            result = AsyncMock()
            result.data = AsyncMock(return_value=node_records if call_count == 1 else rel_records)
            return result

        mock_session.run = _mock_run
        driver = _make_mock_driver(mock_session)

        result = _run(fetch_graph_for_workspace(driver, "my_corpus"))

        assert len(result["nodes"]) == 2
        assert result["nodes"][0]["id"] == "Alice"
        assert result["nodes"][0]["type"] == "person"
        assert len(result["links"]) == 1
        assert result["links"][0]["source"] == "Alice"
        assert result["links"][0]["label"] == "knows"

    def test_filters_junk_nodes(self):
        node_records = [
            {"entity_id": "Alice", "entity_type": "PERSON", "description": "ok", "eid": "1"},
            {"entity_id": "chunk-abc123def", "entity_type": "CHUNK", "description": "junk", "eid": "2"},
            {"entity_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "entity_type": "UUID", "description": "junk", "eid": "3"},
        ]

        call_count = 0
        mock_session = AsyncMock()

        async def _mock_run(query):
            nonlocal call_count
            call_count += 1
            result = AsyncMock()
            result.data = AsyncMock(return_value=node_records if call_count == 1 else [])
            return result

        mock_session.run = _mock_run
        driver = _make_mock_driver(mock_session)

        result = _run(fetch_graph_for_workspace(driver, "test"))
        assert len(result["nodes"]) == 1
        assert result["nodes"][0]["id"] == "Alice"

    def test_filters_links_without_label(self):
        node_records = [
            {"entity_id": "A", "entity_type": "ENTITY", "description": "", "eid": "1"},
            {"entity_id": "B", "entity_type": "ENTITY", "description": "", "eid": "2"},
        ]
        rel_records = [
            {"source": "A", "target": "B", "description": "", "keywords": ""},
            {"source": "A", "target": "B", "description": "related to", "keywords": None},
        ]

        call_count = 0
        mock_session = AsyncMock()

        async def _mock_run(query):
            nonlocal call_count
            call_count += 1
            result = AsyncMock()
            result.data = AsyncMock(return_value=node_records if call_count == 1 else rel_records)
            return result

        mock_session.run = _mock_run
        driver = _make_mock_driver(mock_session)

        result = _run(fetch_graph_for_workspace(driver, "test"))
        assert len(result["links"]) == 1
        assert result["links"][0]["label"] == "related to"
