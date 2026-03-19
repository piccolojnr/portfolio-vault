"""Storage endpoints — URL resolution + test upload."""

import hashlib

from fastapi import APIRouter, Depends, Query, UploadFile, File

from memra.app.core.dependencies import get_current_user
from memra.infrastructure.storage import get_storage_backend

router = APIRouter(prefix="/storage", tags=["storage"])


@router.get("/url")
async def get_storage_url(
    path: str = Query(..., description="Stored file path"),
    current_user: dict = Depends(get_current_user),
):
    """Return a public URL for the given storage path, or null if not available."""
    url = await get_storage_backend().get_public_url(path)
    return {"url": url}


# ---------------------------------------------------------------------------
# Temporary test endpoint — remove before prod
# ---------------------------------------------------------------------------

@router.post("/test-upload")
async def test_upload(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a file and return the stored path + public URL.

    ⚠️  Temporary endpoint for manual testing only.
    """
    from memra.domain.services.lightrag_service import CORPUS_ID

    data = await file.read()
    file_hash = hashlib.sha256(data).hexdigest()
    content_type = file.content_type or "application/octet-stream"
    path = f"{CORPUS_ID}/{file_hash}/{file.filename}"

    storage = get_storage_backend()
    stored_path = await storage.upload(path, data, content_type)
    url = await storage.get_public_url(stored_path)

    return {
        "filename": file.filename,
        "size": len(data),
        "content_type": content_type,
        "file_hash": file_hash,
        "stored_path": stored_path,
        "url": url,
    }
