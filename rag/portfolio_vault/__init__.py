"""
Portfolio Vault RAG Package
===========================

A modular RAG (Retrieval-Augmented Generation) system for querying
Daud Rahim's portfolio, experience, and skills.

Main API:
  from portfolio_vault import retrieve_and_answer
  from app.config import get_settings

  settings = get_settings()
  answer, chunks = retrieve_and_answer("Which projects involved payment processing?", settings)
  print(answer)
"""

from portfolio_vault.embedding import embed
from portfolio_vault.retrieval import retrieve, route_query
from portfolio_vault.generation import generate
from portfolio_vault.database import get_qdrant_client, get_collection


def retrieve_and_answer(question: str, settings=None, n_results: int = 5) -> tuple[str, list[dict]]:
    """
    High-level API: Ask a question and get an answer with retrieved context.

    Returns: (answer_text, retrieved_chunks)
    """
    if settings is None:
        from app.config import get_settings
        settings = get_settings()

    chunks = retrieve(question, settings=settings, n=n_results)
    answer = generate(question, chunks, settings=settings)
    return answer, chunks


__all__ = [
    "retrieve_and_answer",
    "retrieve",
    "generate",
    "embed",
    "route_query",
    "get_qdrant_client",
    "get_collection",
]
