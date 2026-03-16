"""GET /api/v1/graph/{corpus_id} — serve the knowledge graph for a corpus."""

from __future__ import annotations

from pathlib import Path

import networkx as nx
from fastapi import APIRouter, HTTPException, Request

from portfolio_rag.app.core.limiter import limiter

router = APIRouter(prefix="/graph", tags=["graph"])

# rag/ directory is five levels above this file
# (src/portfolio_rag/app/api/v1/graph.py → v1/ → api/ → app/ → portfolio_rag/ → src/ → rag/)
_RAG_DIR = Path(__file__).resolve().parents[5]


@router.get("/{corpus_id}")
@limiter.limit("30/minute")
async def get_graph(request: Request, corpus_id: str):
    """Return nodes and links for the named corpus knowledge graph."""
    graph_path = (
        _RAG_DIR / "data" / "graphs" / corpus_id / "graph_chunk_entity_relation.graphml"
    )
    if not graph_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Graph for corpus '{corpus_id}' not found",
        )
    G = nx.read_graphml(str(graph_path))
    nodes = [
        {
            "id": n,
            "label": d.get("entity_name", n),
            "type": d.get("entity_type", "unknown").lower(),
        }
        for n, d in G.nodes(data=True)
    ]
    links = [
        {
            "source": u,
            "target": v,
            "label": d.get("description", d.get("keywords", "")),
        }
        for u, v, d in G.edges(data=True)
    ]
    return {"nodes": nodes, "links": links}
