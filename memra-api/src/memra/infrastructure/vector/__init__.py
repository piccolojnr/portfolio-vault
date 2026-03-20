"""Vector client provider abstraction."""

from __future__ import annotations

from memra.infrastructure.vector.qdrant import get_qdrant_client


def get_vector_client(settings):
    provider = (getattr(settings, "vector_provider", "qdrant") or "qdrant").lower()
    # infrastructure.vector currently supports Qdrant client semantics.
    # LightRAG local fallback is handled via NanoVectorDBStorage in
    # domain/services/lightrag_service.py for provider=nano/chroma.
    if provider != "qdrant":
        raise RuntimeError(
            "memra.infrastructure.vector supports only vector_provider='qdrant'. "
            "Use LightRAG vector_provider='nano' for local non-qdrant mode."
        )
    return get_qdrant_client(settings)


# Backward-compat alias used by scripts/legacy call sites
def get_collection(settings=None):
    if settings is None:
        from memra.app.core.config import get_settings

        settings = get_settings()
    return get_vector_client(settings)
