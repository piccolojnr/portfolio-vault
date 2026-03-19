"""
STAGE 1C: Query
===============

Example usage of the LightRAG query service.

Run:
  cd rag
  .\.venv\Scripts\python.exe scripts/03_query.py
"""

import asyncio

from memra.app.core.config import get_settings
from memra.domain.services.lightrag_service import CORPUS_ID, query


async def main() -> None:
    settings = get_settings()

    test_queries = [
        "Which of Daud's projects involved payment processing?",
        "What IoT or hardware work has Daud done?",
        "How many users has Daud's work reached?",
        "What is Daud's strongest technical skill?",
    ]

    for question in test_queries:
        print(f"\nQuestion: {question}")
        print("-" * 50)

        result = await query(CORPUS_ID, question, settings, mode="hybrid")
        chunks = result.chunks

        print(f"Retrieved {len(chunks)} chunks:")
        for c in chunks:
            source = c.get("file_path", "unknown")
            content = (c.get("content", "") or "").replace("\n", " ").strip()
            preview = content[:90] + ("..." if len(content) > 90 else "")
            print(f"  - {source}: {preview}")

        print(f"\nAnswer:")
        print(result.answer)
        print()


if __name__ == "__main__":
    asyncio.run(main())
