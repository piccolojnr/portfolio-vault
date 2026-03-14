"""
STAGE 1C: Query
===============

Example usage of the core RAG package.

Run:
  cd rag
  .\.venv\Scripts\python.exe scripts/03_query.py
"""

from app.config import get_settings
from core import retrieve_and_answer

if __name__ == "__main__":
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

        answer, chunks, usage = retrieve_and_answer(question, settings=settings, n_results=5)

        print(f"Retrieved {len(chunks)} chunks:")
        for c in chunks:
            icon = "G" if c['similarity'] > 0.7 else "Y" if c['similarity'] > 0.4 else "R"
            print(f"  [{icon}] sim={c['similarity']}  {c['source']} / {c['heading']}")

        print(f"\nAnswer:")
        print(answer)
        print()
