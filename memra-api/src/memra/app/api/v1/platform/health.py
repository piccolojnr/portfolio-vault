"""
Platform Admin System Health Router
======================================

GET /health/detailed → component health checks with timeouts
"""

from __future__ import annotations

import asyncio
import time
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from memra.app.core.db import get_db_conn
from memra.app.core.platform_auth import get_platform_admin

router = APIRouter(prefix="/health", tags=["platform-admin-health"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]
Admin = Annotated[dict, Depends(get_platform_admin)]

_start_time = time.time()
_TIMEOUT = 3.0
_LIGHTRAG_QDRANT_COLLECTIONS = [
    "lightrag_vdb_entities",
    "lightrag_vdb_relationships",
    "lightrag_vdb_chunks",
]


def _resolve_lightrag_qdrant_collections(client) -> dict[str, str]:
    """Resolve LightRAG base names to actual Qdrant collection names."""
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


async def _check_db(session: AsyncSession) -> tuple[str, float, str | None]:
    start = time.time()
    try:
        await asyncio.wait_for(
            session.execute(text("SELECT 1")),
            timeout=_TIMEOUT,
        )
        return "ok", round((time.time() - start) * 1000, 1), None
    except Exception as e:
        return (
            "error",
            round((time.time() - start) * 1000, 1),
            str(e),
        )


async def _check_qdrant() -> tuple[str, float, str | None]:
    start = time.time()
    try:
        from memra.app.core.config import get_settings
        settings = get_settings()
        from memra.infrastructure.vector import get_vector_client

        client = get_vector_client(settings)
        errors: list[str] = []
        resolved_collections = _resolve_lightrag_qdrant_collections(client)
        for name in _LIGHTRAG_QDRANT_COLLECTIONS:
            actual_name = resolved_collections.get(name)
            if not actual_name:
                errors.append(f"{name}: collection not found")
                continue
            try:
                await asyncio.wait_for(
                    asyncio.get_event_loop().run_in_executor(
                        None, lambda: client.count(collection_name=actual_name).count
                    ),
                    timeout=_TIMEOUT,
                )
            except Exception as e:
                errors.append(f"{name}: {e}")

        if errors:
            return "error", round((time.time() - start) * 1000, 1), "; ".join(errors)

        return "ok", round((time.time() - start) * 1000, 1), None
    except Exception as e:
        return (
            "error",
            round((time.time() - start) * 1000, 1),
            f"{e}",
        )


async def _check_neo4j(request: Request) -> tuple[str, float, str | None]:
    """Neo4j is ok when connectivity is healthy for a trivial query."""
    start = time.time()
    try:
        from memra.app.core.config import get_settings
        from memra.infrastructure.neo4j import neo4j_health_check

        settings = get_settings()
        if not settings.neo4j_uri:
            return "ok", 0.0, None

        neo4j_driver = getattr(request.app.state, "neo4j_driver", None)
        if neo4j_driver is None:
            return (
                "error",
                round((time.time() - start) * 1000, 1),
                "neo4j driver not initialized",
            )

        result = await asyncio.wait_for(
            neo4j_health_check(neo4j_driver),
            timeout=_TIMEOUT,
        )
        if result == "ok":
            return "ok", round((time.time() - start) * 1000, 1), None
        return (
            "error",
            round((time.time() - start) * 1000, 1),
            str(result),
        )
    except Exception as e:
        return (
            "error",
            round((time.time() - start) * 1000, 1),
            str(e),
        )


async def _check_worker(session: AsyncSession) -> tuple[str, float, str | None]:
    """Worker is ok if it recently picked up a job, or if no jobs are waiting."""
    start = time.time()
    try:
        result = await session.execute(
            text(
                "SELECT MAX(started_at) AS last_started,"
                " COUNT(*) FILTER (WHERE status = 'pending') AS pending"
                " FROM jobs"
            )
        )
        row = result.mappings().first()
        elapsed = round((time.time() - start) * 1000, 1)
        if row is None:
            return "ok", elapsed, None

        pending = row["pending"] or 0
        last = row["last_started"]

        if last is not None:
            from datetime import datetime, timezone
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            age = (datetime.now(timezone.utc) - last).total_seconds()
            if age <= 300:
                return "ok", elapsed, None
            if pending == 0:
                return "ok", elapsed, None
            if age <= 600:
                return "stale", elapsed, f"pending={pending}, age_seconds={age:.1f}"
            return "offline", elapsed, f"pending={pending}, age_seconds={age:.1f}"

        if pending == 0:
            return "ok", elapsed, None
        return "offline", elapsed, f"pending={pending}"
    except Exception as e:
        return "error", round((time.time() - start) * 1000, 1), str(e)


async def _check_email() -> tuple[str, float, str | None]:
    start = time.time()
    try:
        from memra.app.core.config import get_settings
        settings = get_settings()
        if settings.email_backend == "console":
            return "ok", 0.0, None
        if settings.email_backend == "mailpit":
            import socket
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(_TIMEOUT)
            sock.connect((settings.mailpit_host, settings.mailpit_port))
            sock.close()
            return "ok", round((time.time() - start) * 1000, 1), None
        # resend — just check if key is set
        if settings.resend_api_key:
            return "ok", 0.0, None
        return "error", 0.0, "missing resend_api_key"
    except Exception as e:
        return "error", round((time.time() - start) * 1000, 1), str(e)


async def _check_storage() -> tuple[str, float, str | None]:
    start = time.time()
    try:
        from memra.app.core.config import get_settings
        settings = get_settings()
        if settings.storage_provider == "local":
            return "ok", 0.0, None
        if settings.supabase_storage_url and settings.supabase_storage_key:
            return "ok", 0.0, None
        return (
            "error",
            0.0,
            "supabase storage config missing (supabase_storage_url / supabase_storage_key)",
        )
    except Exception as e:
        return "error", round((time.time() - start) * 1000, 1), str(e)


async def _check_paystack(session: AsyncSession) -> tuple[str, float, str | None]:
    """Paystack is ok when platform/env diagnostics are fully configured.

    This check is configuration-only (no external Paystack API calls).
    """
    start = time.time()
    try:
        from memra.app.core.config import get_settings
        from memra.app.api.v1.platform.settings import paystack_config_diagnostics

        settings = get_settings()
        diag = await asyncio.wait_for(
            paystack_config_diagnostics(session=session, settings=settings),
            timeout=_TIMEOUT,
        )
        status = str(diag.get("status") or "not_configured")
        key_mode = diag.get("key_mode")
        errors = diag.get("details", {}).get("errors") or []
        # UI expects "ok" for healthy; anything else treated as degraded.
        if status == "ok":
            detail = f"key_mode={key_mode}" if key_mode else None
            return "ok", round((time.time() - start) * 1000, 1), detail
        detail = "; ".join(errors) if errors else f"status={status}, key_mode={key_mode}"
        return "error", round((time.time() - start) * 1000, 1), detail
    except Exception as e:
        return "error", round((time.time() - start) * 1000, 1), str(e)


def _get_version() -> str:
    try:
        from importlib.metadata import version
        return version("memra")
    except Exception:
        return "dev"


@router.get("/detailed")
async def detailed_health(session: DBSession, admin: Admin, request: Request):
    db_status, db_ms, db_detail = await _check_db(session)
    qdrant_status, qdrant_ms, qdrant_detail = await _check_qdrant()
    worker_status, worker_ms, worker_detail = await _check_worker(session)
    email_status, email_ms, email_detail = await _check_email()
    storage_status, storage_ms, storage_detail = await _check_storage()
    paystack_status, paystack_ms, paystack_detail = await _check_paystack(session)
    neo4j_status, neo4j_ms, neo4j_detail = await _check_neo4j(request)

    return {
        "api_server": "ok",
        "database": {"status": db_status, "response_ms": db_ms, "detail": db_detail},
        "qdrant": {"status": qdrant_status, "response_ms": qdrant_ms, "detail": qdrant_detail},
        "worker": {"status": worker_status, "response_ms": worker_ms, "detail": worker_detail},
        "email": {"status": email_status, "response_ms": email_ms, "detail": email_detail},
        "storage": {"status": storage_status, "response_ms": storage_ms, "detail": storage_detail},
        "paystack": {"status": paystack_status, "response_ms": paystack_ms, "detail": paystack_detail},
        "neo4j": {"status": neo4j_status, "response_ms": neo4j_ms, "detail": neo4j_detail},
        "uptime_seconds": round(time.time() - _start_time),
        "version": _get_version(),
    }
