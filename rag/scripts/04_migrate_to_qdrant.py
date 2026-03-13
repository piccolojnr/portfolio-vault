"""
STAGE 2A: Migrate from ChromaDB → Qdrant (using package imports)
================================================================

Migrate embeddings to cloud Qdrant instance.

Requires .env:
  OPENAI_API_KEY=sk-...
  QDRANT_URL=https://xxx.qdrant.io:6333
  QDRANT_API_KEY=...

Run:
  cd rag
  .\.venv\Scripts\python.exe scripts/04_migrate_to_qdrant.py
"""

import sys
from pathlib import Path
import json

# Add parent directory to path so portfolio_vault can be imported
sys.path.insert(0, str(Path(__file__).parent.parent))

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct,
    PayloadSchemaType, Filter, FieldCondition, MatchValue
)

from portfolio_vault.config import (
    OPENAI_KEY, QDRANT_URL, QDRANT_API_KEY,
    CHUNKS_FILE, print_config
)
from portfolio_vault.embedding import embed


if __name__ == "__main__":
    print_config()
    
    # Check required env vars
    if not all([OPENAI_KEY, QDRANT_URL, QDRANT_API_KEY]):
        print("Missing env vars. Need: OPENAI_API_KEY, QDRANT_URL, QDRANT_API_KEY")
        exit(1)
    
    COLLECTION = "portfolio_vault"
    
    # Load chunks
    chunks = json.load(open(CHUNKS_FILE))
    chunks = [c for c in chunks if c["word_count"] >= 10]
    print(f"\nChunks to migrate: {len(chunks)}")
    
    # Embed
    print("\nEmbedding chunks via OpenAI...")
    texts = [c["content"] for c in chunks]
    vectors = embed(texts)
    print(f"Got {len(vectors)} vectors × {len(vectors[0])} dims")
    
    # Connect to Qdrant
    client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
    print(f"\nConnected to Qdrant at {QDRANT_URL}")
    
    # Recreate collection
    if client.collection_exists(COLLECTION):
        client.delete_collection(COLLECTION)
        print(f"Deleted existing '{COLLECTION}' collection")
    
    client.create_collection(
        collection_name=COLLECTION,
        vectors_config=VectorParams(
            size=len(vectors[0]),
            distance=Distance.COSINE,
        ),
    )
    print(f"Created collection '{COLLECTION}'")
    
    # Index source field
    client.create_payload_index(
        collection_name=COLLECTION,
        field_name="source",
        field_schema=PayloadSchemaType.KEYWORD,
    )
    print("Indexed 'source' payload field")
    
    # Upsert points
    points = []
    for i, (chunk, vector) in enumerate(zip(chunks, vectors)):
        points.append(PointStruct(
            id=i,
            vector=vector,
            payload={
                "chunk_id": chunk["id"],
                "source": chunk["source"],
                "heading": chunk["heading"],
                "word_count": chunk["word_count"],
                "content": chunk["content"],
            }
        ))
    
    client.upsert(collection_name=COLLECTION, points=points)
    print(f"\nUpserted {len(points)} points into Qdrant")
    
    # Verify
    info = client.get_collection(COLLECTION)
    print(f"Collection now has {info.points_count} points")
    
    # Test retrieval
    print("\n" + "="*60)
    print("TEST: Semantic search in Qdrant")
    print("="*60)
    
    test_queries = [
        ("payment Paystack integration", None),
        ("IoT hardware kiosk locker", None),
        ("Next.js TypeScript web project", "project_kgl"),
    ]
    
    for query, source_filter in test_queries:
        qvec = embed([query])[0]
        
        search_filter = None
        if source_filter:
            search_filter = Filter(
                must=[FieldCondition(key="source", match=MatchValue(value=source_filter))]
            )
        
        results = client.query_points(
            collection_name=COLLECTION,
            query=qvec,
            limit=3,
            query_filter=search_filter,
            with_payload=True,
        )
        
        label = f"\"{query}\"" + (f"  [filtered to: {source_filter}]" if source_filter else "")
        print(f"\nQuery: {label}")
        for r in results.points:
            icon = "G" if r.score > 0.5 else "Y" if r.score > 0.3 else "R"
            print(f"  [{icon}] score={r.score:.3f}  {r.payload['source']} / {r.payload['heading']}")
            print(f"       \"{r.payload['content'][:100].replace(chr(10),' ')}...\"")
    
    print("\nMigration complete. Qdrant is ready.")
    print("Save these for your Next.js .env.local:")
    print(f"  QDRANT_URL={QDRANT_URL}")
    print(f"  QDRANT_API_KEY=<your key>")
    print(f"  QDRANT_COLLECTION={COLLECTION}")
