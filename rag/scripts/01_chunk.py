"""
STAGE 1A: Chunking
==================

Split portfolio vault documents (read from DB) into meaningful chunks.

Run:
  cd rag
  .\.venv\Scripts\python.exe scripts/01_chunk.py
"""

import json
import re

from app.config import get_settings
from portfolio_vault.vault_db import get_docs

settings = get_settings()


def split_by_headings(text: str) -> list[dict]:
    """Split a markdown document into sections based on headings."""
    parts = re.split(r'\n(?=#{1,3} )', text.strip())

    sections = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        lines = part.split('\n')
        heading = lines[0].lstrip('#').strip()
        sections.append({"heading": heading, "content": part})

    return sections


def word_count(text: str) -> int:
    return len(text.split())


def chunk_document(source_slug: str, content: str) -> list[dict]:
    """Produce a list of chunks from a document's slug and content string."""
    sections = split_by_headings(content)

    chunks = []
    for i, section in enumerate(sections):
        wc = word_count(section["content"])

        if wc > 350:
            paragraphs = [p.strip() for p in section["content"].split('\n\n') if p.strip()]

            window: list[str] = []
            window_wc = 0
            sub_idx = 0

            for para in paragraphs:
                para_wc = word_count(para)

                if window_wc + para_wc > 300 and window:
                    chunk_text = '\n\n'.join(window)
                    chunks.append({
                        "id": f"{source_slug}__{i}_{sub_idx}",
                        "source": source_slug,
                        "heading": section["heading"],
                        "content": chunk_text,
                        "word_count": word_count(chunk_text),
                    })
                    sub_idx += 1
                    window = [window[-1]] if window else []
                    window_wc = word_count(window[0]) if window else 0

                window.append(para)
                window_wc += para_wc

            if window:
                chunk_text = '\n\n'.join(window)
                chunks.append({
                    "id": f"{source_slug}__{i}_{sub_idx}",
                    "source": source_slug,
                    "heading": section["heading"],
                    "content": chunk_text,
                    "word_count": word_count(chunk_text),
                })
        else:
            chunks.append({
                "id": f"{source_slug}__{i}_0",
                "source": source_slug,
                "heading": section["heading"],
                "content": section["content"],
                "word_count": wc,
            })

    return chunks


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
