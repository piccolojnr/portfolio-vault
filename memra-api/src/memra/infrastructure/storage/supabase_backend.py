"""Supabase Storage backend (requires supabase>=2.0)."""

from __future__ import annotations

import asyncio

from memra.infrastructure.storage.base import StorageBackend


class SupabaseStorageBackend(StorageBackend):
    """Stores files in a Supabase Storage bucket.

    supabase-py v2 is sync/httpx internally; all calls are wrapped in
    asyncio.to_thread() to avoid blocking the event loop.
    """

    def __init__(self, url: str, key: str, bucket: str) -> None:
        # Lazy import so the package remains optional at import time
        try:
            from supabase import create_client  # type: ignore[import]
        except ImportError as exc:
            raise ImportError(
                "supabase package is required for SupabaseStorageBackend. "
                "Install it with: pip install 'supabase>=2.0'"
            ) from exc

        if key.startswith("sb_publishable_"):
            raise ValueError(
                "SUPABASE_STORAGE_KEY is a publishable key (sb_publishable_*). "
                "Server-side uploads require a service-role key "
                "(SUPABASE_SERVICE_ROLE_KEY / sb_secret_*), or matching RLS insert policies."
            )

        self._client = create_client(url, key)
        self._bucket = bucket

    async def upload(self, path: str, data: bytes, content_type: str) -> str:
        await asyncio.to_thread(
            self._client.storage.from_(self._bucket).upload,
            path,
            data,
            {"content-type": content_type, "upsert": "true"},
        )
        return path

    async def get_public_url(self, path: str) -> str | None:
        url: str = self._client.storage.from_(self._bucket).get_public_url(path)
        return url or None

    async def delete(self, path: str) -> None:
        await asyncio.to_thread(
            self._client.storage.from_(self._bucket).remove,
            [path],
        )

    async def download(self, path: str) -> bytes:
        data = await asyncio.to_thread(
            self._client.storage.from_(self._bucket).download,
            path,
        )
        return data if isinstance(data, bytes) else bytes(data)
