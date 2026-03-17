"""
Storage infrastructure package.

`get_storage_backend()` is the single factory for creating a StorageBackend
instance.  It is cached for the process lifetime via @lru_cache — storage
provider changes take effect on restart.
"""

from __future__ import annotations

from functools import lru_cache

from portfolio_rag.infrastructure.storage.base import StorageBackend


@lru_cache(maxsize=1)
def get_storage_backend() -> StorageBackend:
    """Return the configured StorageBackend (local or supabase)."""
    from portfolio_rag.app.core.config import get_settings

    settings = get_settings()
    provider = getattr(settings, "storage_provider", "local")

    if provider == "supabase":
        from portfolio_rag.infrastructure.storage.supabase_backend import SupabaseStorageBackend

        return SupabaseStorageBackend(
            url=settings.supabase_storage_url,
            key=settings.supabase_storage_key,
            bucket=settings.storage_bucket,
        )

    from portfolio_rag.infrastructure.storage.local_backend import LocalStorageBackend

    return LocalStorageBackend(base_dir=settings.data_dir / "uploads")


__all__ = ["StorageBackend", "get_storage_backend"]
