"""
STAGE 1B: Embedding + Storage (using package imports)
=====================================================

Embed chunks and store them in ChromaDB.

Run:
  cd rag
  .\.venv\Scripts\python.exe scripts/02_embed_and_store.py
"""

import sys
from pathlib import Path
import json
import chromadb

# Add parent directory to path so portfolio_vault can be imported
sys.path.insert(0, str(Path(__file__).parent.parent))

from portfolio_vault.config import (
    USE_DEMO, OPENAI_KEY, CHROMA_PATH, CHROMA_COLLECTION,
    CHUNKS_FILE, print_config
)
from portfolio_vault.embedding import embed

if __name__ == "__main__":
    print_config()
    
    # Load chunks
    chunks = json.load(open(CHUNKS_FILE))
    chunks = [c for c in chunks if c["word_count"] >= 10]
    print(f"\nChunks to embed: {len(chunks)}")
    
    # Create ChromaDB collection
    chroma_client = chromadb.PersistentClient(path=str(CHROMA_PATH))
    try:
        chroma_client.delete_collection(CHROMA_COLLECTION)
    except:
        pass
    
    collection = chroma_client.create_collection(
        name=CHROMA_COLLECTION,
        metadata={"hnsw:space": "cosine"}
    )
    
    # Embed chunks
    print(f"\nEmbedding {len(chunks)} chunks {'(DEMO)' if USE_DEMO else '(OpenAI)'}...")
    texts = [c["content"] for c in chunks]
    vectors = embed(texts)
    print(f"Vector dimensions: {len(vectors[0])}")
    print(f"Sample (first 6 nums): {[round(x, 4) for x in vectors[0][:6]]}")
    
    # Store in ChromaDB
    collection.add(
        ids=[c["id"] for c in chunks],
        embeddings=vectors,
        documents=texts,
        metadatas=[{
            "source": c["source"],
            "heading": c["heading"],
            "word_count": c["word_count"]
        } for c in chunks],
    )
    print(f"\nStored {collection.count()} chunks in ChromaDB")
    
    # Test retrieval
    print("\n" + "="*60)
    print("RAW RETRIEVAL TEST" + (" (DEMO - results random)" if USE_DEMO else " (real similarity)"))
    print("="*60)
    
    for query in ["payment integration Paystack", "IoT hardware kiosk", "university permit students"]:
        qvec = embed([query])[0]
        results = collection.query(
            query_embeddings=[qvec],
            n_results=3,
            include=["documents", "metadatas", "distances"]
        )
        print(f"\nQuery: \"{query}\"")
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0]
        ):
            sim = round(1 - dist, 3)
            icon = "G" if sim > 0.7 else "Y" if sim > 0.4 else "R"
            print(f"  [{icon}] sim={sim}  [{meta['source']} / {meta['heading']}]")
            print(f"       \"{doc[:90].replace(chr(10),' ')}...\"")
    
    if USE_DEMO:
        print("\n[DEMO] Results are random. With real OpenAI embeddings,")
        print("       results would be meaningful.")
