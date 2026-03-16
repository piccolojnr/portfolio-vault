"""GET /api/v1/health"""

from fastapi import APIRouter, Depends, HTTPException, Request
from portfolio_rag.app.core.config import Settings, get_settings
from portfolio_rag.app.core.dependencies import get_client

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(
    request: Request,
    settings: Settings = Depends(get_settings),
    client=Depends(get_client),
):
    # Qdrant
    try:
        chunk_count = client.count(collection_name=settings.qdrant_collection).count
        qdrant_status = "ok"
    except Exception as e:
        chunk_count = None
        qdrant_status = str(e)

    # Database
    db_status = "not_configured"
    doc_count = None
    if request.app.state.db_session_factory is not None:
        try:
            from sqlmodel import select, func
            from portfolio_rag.infrastructure.db import VaultDocument
            async with request.app.state.db_session_factory() as session:
                result = await session.execute(select(func.count()).select_from(VaultDocument))
                doc_count = result.scalar_one()
            db_status = "ok"
        except Exception as e:
            db_status = str(e)

    overall = "ok" if qdrant_status == "ok" and db_status in ("ok", "not_configured") else "degraded"

    return {
        "status": overall,
        "demo_mode": settings.use_demo,
        "qdrant": {"status": qdrant_status, "chunks_loaded": chunk_count},
        "database": {"status": db_status, "doc_count": doc_count},
    }
