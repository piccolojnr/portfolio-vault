"""
Embedding Functions
===================

Convert text to dense vectors using OpenAI or demo mode.
Returns (vectors, token_count) — callers use token_count for cost tracking.
"""

import math
import random


def embed(texts: list[str], settings=None) -> tuple[list[list[float]], int]:
    """
    Embed texts using OpenAI or demo vectors.

    Returns:
        (vectors, token_count) — token_count is 0 in demo mode.
    """
    if settings is None:
        from portfolio_rag.app.core.config import get_settings
        settings = get_settings()

    if settings.use_demo:
        return _embed_demo(texts), 0
    return _embed_openai(texts, settings)


def _embed_openai(texts: list[str], settings) -> tuple[list[list[float]], int]:
    """Embed using OpenAI API. Returns (vectors, total_tokens)."""
    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)
    response = client.embeddings.create(
        model=settings.embedding_model,
        input=texts,
    )
    vectors = [item.embedding for item in response.data]
    token_count = response.usage.total_tokens
    return vectors, token_count


def _embed_demo(texts: list[str]) -> list[list[float]]:
    """Generate fake vectors for demo mode (16-dim, normalised)."""
    vectors = []
    for text in texts:
        random.seed(hash(text) % (2**32))
        vec = [random.gauss(0, 1) for _ in range(16)]
        magnitude = math.sqrt(sum(x**2 for x in vec))
        vectors.append([x / magnitude for x in vec])
    return vectors
