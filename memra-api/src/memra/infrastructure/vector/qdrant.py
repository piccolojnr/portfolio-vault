"""
Vector Database Connection
===========================

Qdrant client factory. Uses cloud Qdrant when qdrant_url is set,
falls back to local file storage for development / demo mode.
"""

from qdrant_client import QdrantClient


def get_qdrant_client(settings) -> QdrantClient:
    """Return a configured Qdrant client using injected settings."""
    if settings.qdrant_url:
        return QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key or None)
    # Local file-based storage for development / demo
    settings.qdrant_local_path.mkdir(parents=True, exist_ok=True)
    return QdrantClient(path=str(settings.qdrant_local_path))


# Backward-compat alias used by scripts
def get_collection(settings=None):
    if settings is None:
        from memra.app.core.config import get_settings
        settings = get_settings()
    return get_qdrant_client(settings)
