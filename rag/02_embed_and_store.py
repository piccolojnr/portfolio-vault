"""
STAGE 1B (v2): Embedding + Storage — works with OR without OpenAI API key
=========================================================================

Run with real embeddings:
  OPENAI_API_KEY=sk-... python3 02_embed_and_store.py

Run in DEMO MODE (fake vectors, shows the structure without API calls):
  DEMO_MODE=1 python3 02_embed_and_store.py
"""

import json
import os
import random
import math
from pathlib import Path
# Note: chromadb is a local vector database. It will create a folder with its data files.
import chromadb 

# Load .env file
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ[key.strip()] = value.strip()

PROJECT_PATH = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USE_DEMO = os.environ.get("DEMO_MODE") == "1"
OPENAI_KEY = os.environ.get("OPENAI_API_KEY")

if not USE_DEMO and not OPENAI_KEY:
    print("No OPENAI_API_KEY set. Running in DEMO_MODE (fake vectors).")
    print("Set OPENAI_API_KEY=sk-... to use real embeddings.\n")
    USE_DEMO = True

chunks_path = os.path.join(PROJECT_PATH, "rag", "data", "chunks.json")
chunks = json.load(open(chunks_path))
chunks = [c for c in chunks if c["word_count"] >= 10]
print(f"Chunks to embed: {len(chunks)}")

def embed_with_openai(texts):
    from openai import OpenAI
    client = OpenAI(api_key=OPENAI_KEY)
    response = client.embeddings.create(model="text-embedding-3-small", input=texts)
    return [item.embedding for item in response.data]

def embed_demo(texts):
    print("  [DEMO] Generating fake 16-dim vectors (real = 1536-dim from OpenAI)")
    vectors = []
    for text in texts:
        random.seed(hash(text) % (2**32))
        vec = [random.gauss(0, 1) for _ in range(16)]
        magnitude = math.sqrt(sum(x**2 for x in vec))
        vectors.append([x / magnitude for x in vec])
    return vectors

embed_texts = embed_demo if USE_DEMO else embed_with_openai

chroma_client = chromadb.PersistentClient(path=f"{PROJECT_PATH}/rag/data/chroma_db")
try:
    chroma_client.delete_collection("portfolio_vault")
except:
    pass

collection = chroma_client.create_collection(
    name="portfolio_vault",
    metadata={"hnsw:space": "cosine"}
)

print(f"\nEmbedding {len(chunks)} chunks {'(DEMO)' if USE_DEMO else '(OpenAI)'}...")
texts = [c["content"] for c in chunks]
vectors = embed_texts(texts)
print(f"Vector dimensions: {len(vectors[0])}")
print(f"Sample (first 6 nums): {[round(x, 4) for x in vectors[0][:6]]}")

collection.add(
    ids=[c["id"] for c in chunks],
    embeddings=vectors,
    documents=texts,
    metadatas=[{"source": c["source"], "heading": c["heading"], "word_count": c["word_count"]} for c in chunks],
)
print(f"\nStored {collection.count()} chunks in ChromaDB")

print("\n" + "="*60)
print("RAW RETRIEVAL TEST" + (" (DEMO - results random)" if USE_DEMO else " (real similarity)"))
print("="*60)

for query in ["payment integration Paystack", "IoT hardware kiosk", "university permit students"]:
    qvec = embed_texts([query])[0]
    results = collection.query(query_embeddings=[qvec], n_results=3,
                               include=["documents", "metadatas", "distances"])
    print(f"\nQuery: \"{query}\"")
    for doc, meta, dist in zip(results["documents"][0], results["metadatas"][0], results["distances"][0]):
        sim = round(1 - dist, 3)
        icon = "G" if sim > 0.7 else "Y" if sim > 0.4 else "R"
        print(f"  [{icon}] sim={sim}  [{meta['source']} / {meta['heading']}]")
        print(f"       \"{doc[:90].replace(chr(10),' ')}...\"")

if USE_DEMO:
    print("\n[DEMO] Results are random. With real OpenAI embeddings,")
    print("       'payment' would retrieve Paystack chunks, 'IoT' would get kiosk chunks, etc.")
    print("\n  To run for real: OPENAI_API_KEY=sk-... python3 02_embed_and_store.py")
