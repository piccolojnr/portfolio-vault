"""GET /api/v1/graph — serve the knowledge graph for the caller's active corpus."""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

import networkx as nx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Annotated

from memra.app.core.db import get_db_conn
from memra.app.core.dependencies import get_current_user
from memra.app.core.limiter import limiter
from memra.domain.services import org_service

router = APIRouter(prefix="/graph", tags=["graph"])

# rag/ directory is five levels above this file
# (src/memra/app/api/v1/graph.py → v1/ → api/ → app/ → memra/ → src/ → rag/)
_RAG_DIR = Path(__file__).resolve().parents[5]

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
    graph_path = (
        _RAG_DIR / "data" / "graphs" / corpus_key / "graph_chunk_entity_relation.graphml"
    )
    if not graph_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Knowledge graph not built yet. Ingest documents to generate it.",
        )

    import re
    # LightRAG uses the entity name as the node id (e.g. "Daud Rahim", "KGL Group").
    # Internal chunk/source nodes (if any leak through) have hash-like ids such as
    # "chunk-abc123..." or bare hex strings — exclude those.
    _JUNK_RE = re.compile(r'^(chunk-|[0-9a-f]{8}-[0-9a-f]{4}|[0-9a-f]{32,})', re.I)

    G = nx.read_graphml(str(graph_path))

    nodes = [
        {
            "id": n,
            # entity_id attribute mirrors the node id; fall back to n directly
            "label": (d.get("entity_id") or n).strip(),
            "type": d.get("entity_type", "unknown").lower(),
        }
        for n, d in G.nodes(data=True)
        if n.strip() and not _JUNK_RE.match(n.strip())
    ]

    valid_ids = {node["id"] for node in nodes}

    # Only emit edges that connect two real entity nodes and carry a readable label.
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
