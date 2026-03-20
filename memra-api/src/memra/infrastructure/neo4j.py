"""
Neo4j Async Driver
==================

Manages a shared ``AsyncDriver`` instance for the graph endpoint and
any other code that needs direct Neo4j access. LightRAG's ``Neo4JStorage``
manages its own internal driver via env vars — this module is for
application-level queries (e.g. the knowledge graph API).

Usage from the lifespan::

    from memra.infrastructure.neo4j import open_neo4j_driver, close_neo4j_driver

    driver = await open_neo4j_driver(settings)
    app.state.neo4j_driver = driver
    ...
    await close_neo4j_driver(driver)
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

_driver: Any = None


async def open_neo4j_driver(settings) -> Any:
    """Create and verify an async Neo4j driver.  Returns the driver or None."""
    global _driver
    if not settings.neo4j_uri:
        logger.info("[neo4j] NEO4J_URI not set — graph features disabled")
        return None

    try:
        from neo4j import AsyncGraphDatabase
        from neo4j._conf import TrustAll
    except ImportError:
        logger.warning("[neo4j] neo4j package not installed — graph features disabled")
        return None

    def _make_driver(*, uri: str | None = None, trust=None, encrypted: bool | None = None) -> Any:
        target_uri = uri or settings.neo4j_uri
        config: dict[str, Any] = {
            "auth": (settings.neo4j_username, settings.neo4j_password),
            "max_connection_pool_size": 5,
        }
        if trust is not None:
            # neo4j-driver config key: trusted_certificates=TrustAll()/TrustSystemCAs()/TrustCustomCAs(...)
            config["trusted_certificates"] = trust
        if encrypted is not None:
            config["encrypted"] = encrypted
        return AsyncGraphDatabase.driver(target_uri, **config)

    driver = _make_driver()
    try:
        await driver.verify_connectivity()
        logger.info("[neo4j] connected to %s", settings.neo4j_uri)
    except Exception as exc:
        logger.warning("[neo4j] connectivity check failed: %s", exc)
        # In some dev environments (corporate TLS interception, custom CA chains),
        # certificate verification can fail even when the endpoint is reachable.
        # Retry with TrustAll in non-production so health can become meaningful.
        import traceback

        exc_text = "".join(
            traceback.format_exception(type(exc), exc, exc.__traceback__)
        )
        if (
            exc_text.find("CERTIFICATE_VERIFY_FAILED") != -1
            or exc_text.find("self-signed certificate") != -1
        ):
            if getattr(settings, "environment", "").lower() != "production":
                try:
                    logger.warning("[neo4j] retrying with trust=TrustAll() for dev")
                    try:
                        await driver.close()
                    except Exception:
                        pass
                    # neo4j-driver requires trusted_certificates only with `neo4j://` / `bolt://` URI
                    # schemes. If the configured URI already includes `+s`, rewrite it for the retry.
                    retry_uri = settings.neo4j_uri
                    retry_uri = retry_uri.replace("neo4j+s://", "neo4j://")
                    retry_uri = retry_uri.replace("neo4j+ssc://", "neo4j://")
                    retry_uri = retry_uri.replace("bolt+s://", "bolt://")
                    retry_uri = retry_uri.replace("bolt+ssc://", "bolt://")
                    driver = _make_driver(
                        uri=retry_uri,
                        trust=TrustAll(),
                        encrypted=True,
                    )
                    await driver.verify_connectivity()
                    logger.info("[neo4j] connected after TrustAll retry")
                except Exception as exc2:
                    logger.warning("[neo4j] TrustAll retry failed: %s", exc2)
        # Return the driver anyway — it may recover.

    _driver = driver
    return driver


async def close_neo4j_driver(driver: Any | None = None) -> None:
    """Close the Neo4j driver gracefully."""
    global _driver
    target = driver or _driver
    if target is not None:
        try:
            await target.close()
        except Exception:
            pass
    _driver = None


async def neo4j_health_check(driver: Any) -> str:
    """Run a trivial Cypher query and return ``"ok"`` or an error string."""
    if driver is None:
        return "not_configured"
    try:
        async with driver.session() as session:
            result = await session.run("RETURN 1 AS n")
            record = await result.single()
            if record and record["n"] == 1:
                return "ok"
            return "unexpected result"
    except Exception as exc:
        return str(exc)


async def fetch_graph_for_workspace(driver: Any, workspace: str) -> dict:
    """Query Neo4j for all entity nodes and relationships in a workspace.

    LightRAG's ``Neo4JStorage`` stores entities as nodes with a label
    matching the workspace.  Relationships connect those nodes.

    Returns ``{"nodes": [...], "links": [...]}``.
    """
    import re

    if driver is None:
        return {"nodes": [], "links": []}

    _JUNK_RE = re.compile(r"^(chunk-|[0-9a-f]{8}-[0-9a-f]{4}|[0-9a-f]{32,})", re.I)

    nodes: list[dict] = []
    links: list[dict] = []

    async with driver.session() as session:
        # Fetch entity nodes — workspace is used as a Neo4j label.
        node_query = (
            "MATCH (n:`%s`) "
            "RETURN n.entity_id AS entity_id, n.entity_type AS entity_type, "
            "       n.description AS description, elementId(n) AS eid"
        ) % workspace.replace("`", "``")

        result = await session.run(node_query)
        records = await result.data()
        for rec in records:
            eid = rec.get("entity_id") or ""
            if not eid.strip() or _JUNK_RE.match(eid.strip()):
                continue
            nodes.append({
                "id": eid.strip(),
                "label": eid.strip(),
                "type": (rec.get("entity_type") or "unknown").lower(),
            })

        valid_ids = {n["id"] for n in nodes}

        # Fetch relationships between workspace nodes.
        rel_query = (
            "MATCH (a:`%s`)-[r]->(b:`%s`) "
            "RETURN a.entity_id AS source, b.entity_id AS target, "
            "       r.description AS description, r.keywords AS keywords"
        ) % (workspace.replace("`", "``"), workspace.replace("`", "``"))

        result = await session.run(rel_query)
        records = await result.data()
        for rec in records:
            src = (rec.get("source") or "").strip()
            tgt = (rec.get("target") or "").strip()
            label = (rec.get("description") or rec.get("keywords") or "").strip()
            if src in valid_ids and tgt in valid_ids and label:
                links.append({
                    "source": src,
                    "target": tgt,
                    "label": label,
                })

    return {"nodes": nodes, "links": links}
