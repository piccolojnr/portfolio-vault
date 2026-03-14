"""
STAGE 1B: Embedding + Storage
==============================

Embed chunks and store them in Qdrant (local or cloud).

Run:
  cd rag
  .venv/Scripts/python.exe scripts/02_embed_and_store.py
"""

import json
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, PayloadSchemaType

from app.config import get_settings
from portfolio_vault.embedding import embed
from portfolio_vault.database import get_qdrant_client


def get_category(source: str) -> str:
    if source.startswith("project_"):
        return "project"
    if source == "brag_sheet":
        return "brag"
    return "general"


if __name__ == "__main__":
    settings = get_settings()

    # Load chunks
    chunks = json.load(open(settings.chunks_file))
    chunks = [c for c in chunks if c["word_count"] >= 10]
    print(f"Chunks to embed: {len(chunks)}")

    # Embed
    print(f"\nEmbedding {len(chunks)} chunks {'(DEMO)' if settings.use_demo else '(OpenAI)'}...")
    texts = [c["content"] for c in chunks]
    vectors = embed(texts, settings=settings)
    print(f"Vector dimensions: {len(vectors[0])}")
    print(f"Sample (first 6 nums): {[round(x, 4) for x in vectors[0][:6]]}")

    # Connect to Qdrant
    client = get_qdrant_client(settings)
    if settings.qdrant_url:
        print(f"\nConnected to Qdrant at {settings.qdrant_url}")
    else:
        print(f"\nUsing local Qdrant at {settings.qdrant_local_path}")

    # Recreate collection
    collection = settings.qdrant_collection
    if client.collection_exists(collection):
        client.delete_collection(collection)
        print(f"Deleted existing '{collection}' collection")

    client.create_collection(
        collection_name=collection,
        vectors_config=VectorParams(size=len(vectors[0]), distance=Distance.COSINE),
    )
    print(f"Created collection '{collection}'")

    # Index payload fields for filtering
    client.create_payload_index(
        collection_name=collection,
        field_name="source",
        field_schema=PayloadSchemaType.KEYWORD,
    )
    client.create_payload_index(
        collection_name=collection,
        field_name="category",
        field_schema=PayloadSchemaType.KEYWORD,
    )
    print("Indexed 'source' and 'category' payload fields")

    # Upsert points
    points = [
        PointStruct(
            id=i,
            vector=vector,
            payload={
                "chunk_id": chunk["id"],
                "source": chunk["source"],
                "category": get_category(chunk["source"]),
                "heading": chunk["heading"],
                "word_count": chunk["word_count"],
                "content": chunk["content"],
            },
        )
        for i, (chunk, vector) in enumerate(zip(chunks, vectors))
    ]

    client.upsert(collection_name=collection, points=points)
    count = client.count(collection_name=collection).count
    print(f"\nStored {count} chunks in Qdrant")

    # Test retrieval
    print("\n" + "=" * 60)
    print("RAW RETRIEVAL TEST" + (" (DEMO - results random)" if settings.use_demo else " (real similarity)"))
    print("=" * 60)

    for query in ["payment integration Paystack", "IoT hardware kiosk", "university permit students"]:
        qvec = embed([query], settings=settings)[0]
        results = client.query_points(
            collection_name=collection,
            query=qvec,
            limit=3,
            with_payload=True,
        ).points
        print(f"\nQuery: \"{query}\"")
        for r in results:
            icon = "G" if r.score > 0.7 else "Y" if r.score > 0.4 else "R"
            print(f"  [{icon}] sim={r.score:.3f}  [{r.payload['source']} / {r.payload['heading']}]")
            print(f"       \"{r.payload['content'][:90].replace(chr(10), ' ')}...\"")

    if settings.use_demo:
        print("\n[DEMO] Results are random. With real OpenAI embeddings,")
        print("       results would be meaningful.")
