"""GET /api/v1/health"""

from fastapi import APIRouter, Depends, HTTPException
from app.config import Settings, get_settings
from app.dependencies import get_client

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(
    settings: Settings = Depends(get_settings),
    client=Depends(get_client),
):
    try:
        count = client.count(collection_name=settings.qdrant_collection).count
        return {
            "status": "ok",
            "chunks_loaded": count,
            "demo_mode": settings.use_demo,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
