"""
STAGE 1A: Chunking
==================

Split portfolio vault documents (read from DB) into meaningful chunks.

Run:
  cd rag
  .\.venv\Scripts\python.exe scripts/01_chunk.py
"""

import json

from app.config import get_settings
from portfolio_vault.chunking import chunk_document
from portfolio_vault.vault_db import get_docs

settings = get_settings()


if __name__ == "__main__":
    if not settings.database_url:
        raise SystemExit("DATABASE_URL is not set in .env")

    docs = get_docs(settings.database_url)
    print(f"Loaded {len(docs)} documents from DB\n")

    all_chunks: list[dict] = []

    for doc in docs:
        doc_chunks = chunk_document(doc.slug, doc.content)
        all_chunks.extend(doc_chunks)
        print(f"{doc.slug:35s} → {len(doc_chunks):2d} chunks")

    print(f"\nTotal chunks: {len(all_chunks)}")
    print(f"Word count range: {min(c['word_count'] for c in all_chunks)} – {max(c['word_count'] for c in all_chunks)}")
    print(f"Average words per chunk: {sum(c['word_count'] for c in all_chunks) // len(all_chunks)}")

    with open(settings.chunks_file, "w") as f:
        json.dump(all_chunks, f, indent=2)

    print(f"\nSaved to {settings.chunks_file}")
    print("\nSample chunks:")
    for c in all_chunks[:3]:
        print(f"\n  [{c['id']}] ({c['word_count']} words)")
        print(f"  Heading: {c['heading']}")
        print(f"  Preview: {c['content'][:120].replace(chr(10), ' ')}...")
