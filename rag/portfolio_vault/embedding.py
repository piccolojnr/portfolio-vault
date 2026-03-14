"""
Embedding Functions
===================

Convert text to dense vectors using OpenAI or demo mode.
Accepts a Settings instance for dependency injection.
"""

import math
import random


def embed(texts: list[str], settings=None) -> list[list[float]]:
    """Embed texts using OpenAI or demo vectors."""
    if settings is None:
        from app.config import get_settings
        settings = get_settings()

    if settings.use_demo:
        return _embed_demo(texts)
    return _embed_openai(texts, settings)


def _embed_openai(texts: list[str], settings) -> list[list[float]]:
    """Embed using OpenAI API."""
    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)
    response = client.embeddings.create(
        model=settings.embedding_model,
        input=texts,
    )
    return [item.embedding for item in response.data]


def _embed_demo(texts: list[str]) -> list[list[float]]:
    """Generate fake vectors for demo mode (16-dim, normalised)."""
    vectors = []
    for text in texts:
        random.seed(hash(text) % (2**32))
        vec = [random.gauss(0, 1) for _ in range(16)]
        magnitude = math.sqrt(sum(x**2 for x in vec))
        vectors.append([x / magnitude for x in vec])
    return vectors
