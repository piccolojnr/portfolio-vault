"""
Query Routing & Retrieval
==========================

Intent-based routing, similarity search, and source capping.
"""

from portfolio_vault.embedding import embed
from portfolio_vault.database import get_collection

def route_query(query: str):
    """
    Determine which sources to search based on query intent.
    Returns metadata filter or None (no filter = search all sources).
    """
    query_lower = query.lower()
    
    # Project-specific queries
    if any(x in query_lower for x in ["which project", "what project", "built a", "created a", "developed a", "launched"]):
        return {"source": {"$contains": "project_"}}
    
    # Impact/metric queries
    if any(x in query_lower for x in ["how many", "how much", "users", "processed", "revenue", "impact", "reach"]):
        return {"source": {"$contains": "brag"}}
    
    # Skills/tech queries
    if any(x in query_lower for x in ["skill", "expertise", "best at", "experience with", "proficient", "strong in"]):
        return None
    
    # Default: search everything
    return None


def retrieve(
    query: str,
    n: int = 5,
    max_per_source: int = 2,
    confidence_threshold: float = 0.4
) -> list[dict]:
    """
    Retrieve relevant chunks from the vector database.
    
    Features:
    1. Intent-based query routing
    2. Confidence-based fallback
    3. Source capping (prevents dominance)
    4. Similarity-sorted results
    """
    collection = get_collection()
    query_vector = embed([query])[0]
    
    # Step 1: Determine routing intent
    where_filter = route_query(query)
    routing_attempted = where_filter is not None
    
    # Step 2: Retrieve 3x what we need to account for filtering
    results = collection.query(
        query_embeddings=[query_vector],
        n_results=n * 3,
        where=where_filter,
        include=["documents", "metadatas", "distances"],
    )
    
    # Step 3: Build results list (already sorted by similarity from ChromaDB)
    all_results = []
    for doc, meta, dist in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        all_results.append({
            "content": doc,
            "source": meta["source"],
            "heading": meta["heading"],
            "similarity": round(1 - dist, 3),
        })
    
    # Step 4: Confidence-based fallback
    if routing_attempted and all_results and all_results[0]["similarity"] < confidence_threshold:
        results = collection.query(
            query_embeddings=[query_vector],
            n_results=n * 3,
            include=["documents", "metadatas", "distances"],
        )
        all_results = []
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            all_results.append({
                "content": doc,
                "source": meta["source"],
                "heading": meta["heading"],
                "similarity": round(1 - dist, 3),
            })
    elif routing_attempted and not all_results:
        results = collection.query(
            query_embeddings=[query_vector],
            n_results=n * 3,
            include=["documents", "metadatas", "distances"],
        )
        all_results = []
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            all_results.append({
                "content": doc,
                "source": meta["source"],
                "heading": meta["heading"],
                "similarity": round(1 - dist, 3),
            })
    
    # Step 5: Source capping with proper sorting
    source_counts = {}
    retrieved = []
    
    for result in all_results:
        source = result["source"]
        count = source_counts.get(source, 0)
        
        if count < max_per_source:
            retrieved.append(result)
            source_counts[source] = count + 1
        
        if len(retrieved) >= n:
            break
    
    return retrieved
