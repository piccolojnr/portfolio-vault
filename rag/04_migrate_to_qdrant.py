"""
STAGE 2A: Migrate from ChromaDB → Qdrant
=========================================

What's different about Qdrant vs ChromaDB?
-------------------------------------------
ChromaDB:  runs in-process, saves to a local folder, great for learning
Qdrant:    runs as a separate service (locally via Docker OR cloud-hosted)
           you talk to it over HTTP — same as any other API

The operations are identical:
  - Create a collection  (like creating a table)
  - Upsert points        (insert/update vectors + payload)
  - Query               (find nearest neighbours)
  - Filter              (narrow by metadata before/during search)

One new concept: PAYLOAD
ChromaDB calls it "metadata". Qdrant calls it "payload".
Same idea — structured data attached to each vector point.
In Qdrant you can index payload fields for fast filtering.

Run:
  OPENAI_API_KEY=sk-...  QDRANT_URL=https://xxx.qdrant.io:6333  QDRANT_API_KEY=...  python3 04_migrate_to_qdrant.py
"""

import os, json, math, random

from pathlib import Path
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams,
    PointStruct,
    PayloadSchemaType,
)


env_path = Path(__file__).parent / ".env"
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ[key.strip()] = value.strip()

OPENAI_KEY  = os.environ.get("OPENAI_API_KEY")
QDRANT_URL  = os.environ.get("QDRANT_URL")
QDRANT_KEY  = os.environ.get("QDRANT_API_KEY")
COLLECTION  = "portfolio_vault"

if not all([OPENAI_KEY, QDRANT_URL, QDRANT_KEY]):
    print("Missing env vars. Need: OPENAI_API_KEY, QDRANT_URL, QDRANT_API_KEY")
    exit(1)

PROJECT_PATH = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    # --- Load chunks ---
chunks = json.load(open(f"{PROJECT_PATH}/rag/data/chunks.json"))
chunks = [c for c in chunks if c["word_count"] >= 10]
print(f"Chunks to migrate: {len(chunks)}")

# --- Embed with OpenAI ---
def embed(texts):
    from openai import OpenAI
    client = OpenAI(api_key=OPENAI_KEY)
    resp = client.embeddings.create(model="text-embedding-3-small", input=texts)
    return [item.embedding for item in resp.data]

print("Embedding chunks via OpenAI (text-embedding-3-small, 1536 dims)...")
texts   = [c["content"] for c in chunks]
vectors = embed(texts)
print(f"Got {len(vectors)} vectors × {len(vectors[0])} dims")

# --- Connect to Qdrant ---
client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_KEY)
print(f"\nConnected to Qdrant at {QDRANT_URL}")

# --- (Re)create the collection ---
# VectorParams tells Qdrant: how many dims, what distance metric
# We use COSINE — same as before. (DOT and EUCLID are the alternatives)
if client.collection_exists(COLLECTION):
    client.delete_collection(COLLECTION)
    print(f"Deleted existing '{COLLECTION}' collection")

client.create_collection(
    collection_name=COLLECTION,
    vectors_config=VectorParams(
        size=1536,            # must match your embedding model's output dims
        distance=Distance.COSINE,
    ),
)
print(f"Created collection '{COLLECTION}'")

# Index the 'source' payload field so we can filter by it efficiently
# This is like adding a database index — makes filtered queries fast
client.create_payload_index(
    collection_name=COLLECTION,
    field_name="source",
    field_schema=PayloadSchemaType.KEYWORD,
)
print("Indexed 'source' payload field for fast filtering")

# --- Upsert points ---
# A "point" in Qdrant = { id, vector, payload }
# id must be either a UUID or an unsigned integer
# We convert our string IDs to integers via hash

points = []
for i, (chunk, vector) in enumerate(zip(chunks, vectors)):
    points.append(PointStruct(
        id=i,                        # simple sequential int ID
        vector=vector,
        payload={                    # "payload" = what Chroma called "metadata"
            "chunk_id":   chunk["id"],
            "source":     chunk["source"],
            "heading":    chunk["heading"],
            "word_count": chunk["word_count"],
            "content":    chunk["content"],   # store full text in payload too
        }
    ))

# Upsert in one batch
client.upsert(collection_name=COLLECTION, points=points)
print(f"\nUpserted {len(points)} points into Qdrant")

# Verify
info = client.get_collection(COLLECTION)
print(f"Collection now has {info.points_count} points")

# --- Test retrieval ---
print("\n" + "="*60)
print("TEST: Semantic search in Qdrant")
print("="*60)

from qdrant_client.models import Filter, FieldCondition, MatchValue

test_queries = [
    ("payment Paystack integration",   None),              # no filter
    ("IoT hardware kiosk locker",      None),              # no filter
    ("Next.js TypeScript web project", "project_kgl"),     # filter to one source
]

for query, source_filter in test_queries:
    qvec = embed([query])[0]

    # Optional: build a filter to restrict search to a specific source
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