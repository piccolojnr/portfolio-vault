"""GET /api/v1/health"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from portfolio_rag.app.core.config import Settings, get_settings
from portfolio_rag.app.core.dependencies import get_client

router = APIRouter(tags=["health"])

_WORKER_STALE_SECONDS = 60


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
            from portfolio_rag.infrastructure.db import Document
            async with request.app.state.db_session_factory() as session:
                result = await session.execute(select(func.count()).select_from(Document))
                doc_count = result.scalar_one()
            db_status = "ok"
        except Exception as e:
            db_status = str(e)

    # Storage
    try:
        from portfolio_rag.infrastructure.storage import get_storage_backend
        backend = get_storage_backend()
        storage_provider = settings.storage_provider
        # Probe: attempt to get a URL for a non-existent path — should return
        # None (local) or a URL (supabase) without raising.
        await backend.get_public_url("__health_probe__")
        storage_status = "ok"
    except Exception as e:
        storage_status = str(e)

    # Worker connectivity — inferred from MAX(started_at) in jobs table
    worker_connected: bool | None = None
    if request.app.state.db_session_factory is not None:
        try:
            async with request.app.state.db_session_factory() as _session:
                result = await _session.execute(
                    text("SELECT MAX(started_at) AS last_started FROM jobs")
                )
                row = result.mappings().first()
                last_started = row["last_started"] if row else None
            if last_started is not None:
                if last_started.tzinfo is None:
                    last_started = last_started.replace(tzinfo=timezone.utc)
                age = (datetime.now(timezone.utc) - last_started).total_seconds()
                worker_connected = age <= _WORKER_STALE_SECONDS
        except Exception:
            pass  # jobs table may not exist yet

    overall = (
        "ok"
        if qdrant_status == "ok"
        and db_status in ("ok", "not_configured")
        and storage_status == "ok"
        else "degraded"
    )

    return {
        "status": overall,
        "demo_mode": settings.use_demo,
        "qdrant": {"status": qdrant_status, "chunks_loaded": chunk_count},
        "database": {"status": db_status, "doc_count": doc_count},
        "storage": {"status": storage_status, "provider": storage_provider},
        "worker_connected": worker_connected,
    }
