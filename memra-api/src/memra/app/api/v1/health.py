"""GET /api/v1/health"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from memra.app.core.config import Settings, get_settings
from memra.app.core.dependencies import get_client

router = APIRouter(tags=["health"])

_WORKER_STALE_SECONDS = 60
_LIGHTRAG_QDRANT_COLLECTIONS = [
    "lightrag_vdb_entities",
    "lightrag_vdb_relationships",
    "lightrag_vdb_chunks",
]


def _resolve_lightrag_qdrant_collections(client) -> dict[str, str]:
    """Map expected LightRAG base collection names to actual Qdrant collections.

    LightRAG can suffix collections with embedding model details
    (e.g. lightrag_vdb_chunks_text_embedding_3_small_1536d). We accept any
    collection that exactly matches or starts with the base prefix.
    """
    names = [c.name for c in client.get_collections().collections]
    resolved: dict[str, str] = {}
    for base in _LIGHTRAG_QDRANT_COLLECTIONS:
        exact = next((n for n in names if n == base), None)
        if exact:
            resolved[base] = exact
            continue
        prefixed = next((n for n in names if n.startswith(f"{base}_")), None)
        if prefixed:
            resolved[base] = prefixed
    return resolved


@router.get("/health")
async def health(
    request: Request,
    settings: Settings = Depends(get_settings),
    client=Depends(get_client),
):
    # Qdrant
    try:
        qdrant_errors: list[str] = []
        counts: dict[str, int] = {}
        resolved_collections = _resolve_lightrag_qdrant_collections(client)
        for name in _LIGHTRAG_QDRANT_COLLECTIONS:
            actual_name = resolved_collections.get(name)
            if not actual_name:
                qdrant_errors.append(f"{name}: collection not found")
                continue
            try:
                counts[name] = client.count(collection_name=actual_name).count
            except Exception as e:
                qdrant_errors.append(f"{name}: {e}")

        if qdrant_errors:
            qdrant_status = "; ".join(qdrant_errors)
            chunk_count = None
        else:
            # For UI we expose “chunks loaded” as the number of chunk vectors.
            chunk_count = counts.get("lightrag_vdb_chunks")
            qdrant_status = "ok"
    except Exception as e:
        chunk_count = None
        qdrant_status = str(e)

    # Database
    db_status = "not_configured"
    doc_count = None
    # Use DI settings as the source of truth. In tests, lifespan may be initialized
    # with different settings, but the endpoint should still report correctly.
    if settings.database_url:
        if request.app.state.db_session_factory is not None:
            try:
                from sqlmodel import select, func
                from memra.infrastructure.db import Document
                async with request.app.state.db_session_factory() as session:
                    result = await session.execute(select(func.count()).select_from(Document))
                    doc_count = result.scalar_one()
                db_status = "ok"
            except Exception as e:
                db_status = str(e)
        else:
            db_status = "not_configured"

    # Storage
    storage_provider = settings.storage_provider
    try:
        from memra.infrastructure.storage import get_storage_backend
        backend = get_storage_backend()
        await backend.get_public_url("__health_probe__")
        storage_status = "ok"
    except Exception as e:
        storage_status = str(e)

    # Neo4j
    neo4j_driver = getattr(request.app.state, "neo4j_driver", None)
    if settings.neo4j_uri and neo4j_driver is not None:
        from memra.infrastructure.neo4j import neo4j_health_check
        neo4j_status = await neo4j_health_check(neo4j_driver)
    else:
        neo4j_status = "not_configured"

    # Paystack (configuration-only)
    paystack_info: dict = {"status": "not_configured"}
    paystack_status: str = "not_configured"
    try:
        from memra.app.api.v1.platform.settings import paystack_config_diagnostics

        if request.app.state.db_session_factory is not None and settings.database_url:
            async with request.app.state.db_session_factory() as session:
                paystack_info = await paystack_config_diagnostics(
                    session=session, settings=settings
                )
        else:
            paystack_info = await paystack_config_diagnostics(
                session=None, settings=settings
            )

        paystack_status = str(paystack_info.get("status") or "not_configured")
    except Exception as e:
        paystack_status = str(e)
        paystack_info = {"status": paystack_status}

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
        and neo4j_status in ("ok", "not_configured")
        and paystack_status in ("ok", "not_configured")
        else "degraded"
    )

    return {
        "status": overall,
        "demo_mode": settings.use_demo,
        "qdrant": {"status": qdrant_status, "chunks_loaded": chunk_count},
        "database": {"status": db_status, "doc_count": doc_count},
        "neo4j": {"status": neo4j_status},
        "paystack": paystack_info,
        "storage": {"status": storage_status, "provider": storage_provider},
        "worker_connected": worker_connected,
    }
