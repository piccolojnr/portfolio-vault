"""
Query Routing & Retrieval
==========================

Intent-based routing, Qdrant similarity search, and source capping.
Accepts a Settings instance for dependency injection.
"""

from core.embedding import embed
from core.database import get_qdrant_client


def route_query(query: str):
    """
    Determine which sources to search based on query intent.
    Returns a Qdrant Filter or None (no filter = search all sources).
    """
    from qdrant_client.models import Filter, FieldCondition, MatchValue

    query_lower = query.lower()

    if any(x in query_lower for x in ["which project", "what project", "built a", "created a", "developed a", "launched"]):
        return Filter(must=[FieldCondition(key="category", match=MatchValue(value="project"))])

    if any(x in query_lower for x in ["how many", "how much", "users", "processed", "revenue", "impact", "reach"]):
        return Filter(must=[FieldCondition(key="category", match=MatchValue(value="brag"))])

    return None


def retrieve(
    query: str,
    settings=None,
    n: int = 5,
    max_per_source: int = 2,
    confidence_threshold: float = 0.4,
) -> list[dict]:
    """
    Retrieve relevant chunks from Qdrant.

    Features:
    1. Intent-based query routing
    2. Confidence-based fallback
    3. Source capping (prevents dominance)
    4. Similarity-sorted results
    """
    if settings is None:
        from app.config import get_settings
        settings = get_settings()

    client = get_qdrant_client(settings)
    vectors, _ = embed([query], settings=settings)
    query_vector = vectors[0]

    where_filter = route_query(query)
    routing_attempted = where_filter is not None

    def _query(query_filter=None):
        return client.query_points(
            collection_name=settings.qdrant_collection,
            query=query_vector,
            limit=n * 3,
            query_filter=query_filter,
            with_payload=True,
        ).points

    def _parse(points) -> list[dict]:
        return [
            {
                "content": p.payload["content"],
                "source": p.payload["source"],
                "heading": p.payload["heading"],
                "similarity": round(p.score, 3),
            }
            for p in points
        ]

    all_results = _parse(_query(where_filter))

    # Confidence-based fallback: retry without filter
    if routing_attempted and (
        not all_results or all_results[0]["similarity"] < confidence_threshold
    ):
        all_results = _parse(_query())

    # Source capping
    source_counts: dict[str, int] = {}
    retrieved: list[dict] = []

    for result in all_results:
        source = result["source"]
        count = source_counts.get(source, 0)

        if count < max_per_source:
            retrieved.append(result)
            source_counts[source] = count + 1

        if len(retrieved) >= n:
            break

    return retrieved


# Alias preserved for callers that reference the legacy Qdrant path by name
# during the USE_LEGACY_RETRIEVAL transition (see app/routers/query.py).
retrieve_legacy = retrieve
