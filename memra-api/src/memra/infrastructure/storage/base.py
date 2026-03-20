"""Abstract StorageBackend interface."""

from abc import ABC, abstractmethod


class StorageBackend(ABC):
    """Swappable file-storage abstraction.

    Implementations: LocalStorageBackend, SupabaseStorageBackend.
    All methods are async; sync I/O is wrapped with asyncio.to_thread().
    """

    @abstractmethod
    async def upload(self, path: str, data: bytes, content_type: str) -> str:
        """Store *data* at *path* and return the stored path."""
        ...

    @abstractmethod
    async def get_public_url(self, path: str) -> str | None:
        """Return a public URL for *path*, or None if not applicable."""
        ...

    @abstractmethod
    async def delete(self, path: str) -> None:
        """Remove the file at *path*."""
        ...

    @abstractmethod
    async def download(self, path: str) -> bytes:
        """Read file bytes from *path*."""
        ...
