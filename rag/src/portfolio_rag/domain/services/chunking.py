"""
Chunking Utilities
==================

Shared library for splitting markdown documents into chunks.
Used by both scripts (01_chunk.py) and the API reindex task.
"""

import re


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


def _word_count(text: str) -> int:
    return len(text.split())


def chunk_document(source_slug: str, content: str) -> list[dict]:
    """Produce a list of chunks from a document's slug and content string."""
    sections = split_by_headings(content)

    chunks = []
    for i, section in enumerate(sections):
        wc = _word_count(section["content"])

        if wc > 350:
            paragraphs = [p.strip() for p in section["content"].split('\n\n') if p.strip()]

            window: list[str] = []
            window_wc = 0
            sub_idx = 0

            for para in paragraphs:
                para_wc = _word_count(para)

                if window_wc + para_wc > 300 and window:
                    chunk_text = '\n\n'.join(window)
                    chunks.append({
                        "id": f"{source_slug}__{i}_{sub_idx}",
                        "source": source_slug,
                        "heading": section["heading"],
                        "content": chunk_text,
                        "word_count": _word_count(chunk_text),
                    })
                    sub_idx += 1
                    window = [window[-1]] if window else []
                    window_wc = _word_count(window[0]) if window else 0

                window.append(para)
                window_wc += para_wc

            if window:
                chunk_text = '\n\n'.join(window)
                chunks.append({
                    "id": f"{source_slug}__{i}_{sub_idx}",
                    "source": source_slug,
                    "heading": section["heading"],
                    "content": chunk_text,
                    "word_count": _word_count(chunk_text),
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
