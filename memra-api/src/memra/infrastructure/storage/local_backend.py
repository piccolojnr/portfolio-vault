"""Local filesystem StorageBackend — for development use."""

from __future__ import annotations

import asyncio
from pathlib import Path

from memra.infrastructure.storage.base import StorageBackend


class LocalStorageBackend(StorageBackend):
    """Writes files under *base_dir*.  Public URLs are not supported (returns None)."""

    def __init__(self, base_dir: Path) -> None:
        self._base = base_dir

    async def upload(self, path: str, data: bytes, content_type: str) -> str:
        dest = self._base / path
        await asyncio.to_thread(dest.parent.mkdir, parents=True, exist_ok=True)
        await asyncio.to_thread(dest.write_bytes, data)
        return str(dest)

    async def get_public_url(self, path: str) -> str | None:
        return None  # local storage has no public URLs

    async def delete(self, path: str) -> None:
        dest = self._base / path
        await asyncio.to_thread(lambda: dest.unlink(missing_ok=True))

    async def download(self, path: str) -> bytes:
        p = Path(path)
        if not p.is_absolute():
            p = self._base / path
        return await asyncio.to_thread(p.read_bytes)
