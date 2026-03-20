"""GET /api/v1/graph — serve the knowledge graph for the caller's active corpus."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Annotated

from memra.app.core.db import get_db_conn
from memra.app.core.dependencies import get_current_user
from memra.app.core.limiter import limiter
from memra.domain.services import org_service

router = APIRouter(prefix="/graph", tags=["graph"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]


@router.get("")
@limiter.limit("30/minute")
async def get_graph(
    request: Request,
    session: DBSession,
    current_user: dict = Depends(get_current_user),
):
    """Return nodes and links for the caller's active corpus knowledge graph."""
    org_id = UUID(current_user["org_id"])

    try:
        corpus = await org_service.get_active_corpus(session, org_id)
    except LookupError:
        raise HTTPException(
            status_code=404,
            detail="No active knowledge base. Set one in Organisation Settings.",
        )

    corpus_key = corpus.corpus_key

    driver = getattr(request.app.state, "neo4j_driver", None)
    if driver is not None:
        return await _graph_from_neo4j(driver, corpus_key)
    return await _graph_from_graphml(corpus_key)


async def _graph_from_neo4j(driver, workspace: str) -> dict:
    """Fetch graph data from Neo4j."""
    from memra.infrastructure.neo4j import fetch_graph_for_workspace

    data = await fetch_graph_for_workspace(driver, workspace)
    if not data["nodes"]:
        raise HTTPException(
            status_code=404,
            detail="Knowledge graph not built yet. Ingest documents to generate it.",
        )
    return data


async def _graph_from_graphml(corpus_key: str) -> dict:
    """Legacy fallback: read graph data from .graphml files on disk."""
    import re
    from pathlib import Path

    import networkx as nx

    _RAG_DIR = Path(__file__).resolve().parents[5]
    graph_path = (
        _RAG_DIR / "data" / "graphs" / corpus_key / "graph_chunk_entity_relation.graphml"
    )
    if not graph_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Knowledge graph not built yet. Ingest documents to generate it.",
        )

    _JUNK_RE = re.compile(r"^(chunk-|[0-9a-f]{8}-[0-9a-f]{4}|[0-9a-f]{32,})", re.I)

    G = nx.read_graphml(str(graph_path))

    nodes = [
        {
            "id": n,
            "label": (d.get("entity_id") or n).strip(),
            "type": d.get("entity_type", "unknown").lower(),
        }
        for n, d in G.nodes(data=True)
        if n.strip() and not _JUNK_RE.match(n.strip())
    ]

    valid_ids = {node["id"] for node in nodes}

    links = [
        {
            "source": u,
            "target": v,
            "label": (d.get("description") or d.get("keywords") or "").strip(),
        }
        for u, v, d in G.edges(data=True)
        if u in valid_ids and v in valid_ids
        and (d.get("description") or d.get("keywords") or "").strip()
    ]

    return {"nodes": nodes, "links": links}
