"""
Embedding Functions
===================

Convert text to dense vectors using OpenAI or demo mode.
"""

import math
import random
from portfolio_vault.config import USE_DEMO, OPENAI_KEY, EMBEDDING_MODEL, EMBEDDING_DIMS

def embed(texts: list[str]) -> list[list[float]]:
    """Embed texts using OpenAI or demo vectors."""
    if USE_DEMO:
        return _embed_demo(texts)
    return _embed_openai(texts)

def _embed_openai(texts: list[str]) -> list[list[float]]:
    """Embed using OpenAI API."""
    from openai import OpenAI
    
    client = OpenAI(api_key=OPENAI_KEY)
    response = client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=texts
    )
    return [item.embedding for item in response.data]

def _embed_demo(texts: list[str]) -> list[list[float]]:
    """Generate fake vectors for demo mode."""
    vectors = []
    for text in texts:
        random.seed(hash(text) % (2**32))
        vec = [random.gauss(0, 1) for _ in range(16)]  # Demo uses 16 dims
        magnitude = math.sqrt(sum(x**2 for x in vec))
        vectors.append([x / magnitude for x in vec])
    return vectors
