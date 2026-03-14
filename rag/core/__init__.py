"""
Core RAG Package
================

A modular RAG (Retrieval-Augmented Generation) system for querying
Daud Rahim's portfolio, experience, and skills.

Main API:
  from core import retrieve_and_answer
  from app.config import get_settings

  settings = get_settings()
  answer, chunks, usage = retrieve_and_answer("Which projects involved payment processing?", settings)
  print(answer)
"""

from core.embedding import embed
from core.retrieval import retrieve, route_query
from core.generation import generate
from core.database import get_qdrant_client, get_collection


def retrieve_and_answer(
    question: str,
    settings=None,
    n_results: int = 5,
) -> tuple[str, list[dict], dict]:
    """
    High-level API: Ask a question and get an answer with retrieved context.

    Returns: (answer_text, retrieved_chunks, usage_info)
    usage_info has keys: provider, model, input_tokens, output_tokens, total_tokens, cost_usd
    """
    if settings is None:
        from app.config import get_settings
        settings = get_settings()

    chunks = retrieve(question, settings=settings, n=n_results)
    answer, usage = generate(question, chunks, settings=settings)
    return answer, chunks, usage


__all__ = [
    "retrieve_and_answer",
    "retrieve",
    "generate",
    "embed",
    "route_query",
    "get_qdrant_client",
    "get_collection",
]
