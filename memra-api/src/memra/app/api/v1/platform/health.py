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


async def _check_db(session: AsyncSession) -> tuple[str, float]:
    start = time.time()
    try:
        await asyncio.wait_for(
            session.execute(text("SELECT 1")),
            timeout=_TIMEOUT,
        )
        return "ok", round((time.time() - start) * 1000, 1)
    except Exception:
        return "error", round((time.time() - start) * 1000, 1)


async def _check_qdrant() -> tuple[str, float]:
    start = time.time()
    try:
        from memra.app.core.config import get_settings
        settings = get_settings()
        if not settings.qdrant_url:
            return "ok", 0.0  # local mode, always ok
        from memra.infrastructure.vector.qdrant import get_qdrant_client
        client = get_qdrant_client(settings)
        await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(
                None, lambda: client.get_collections()
            ),
            timeout=_TIMEOUT,
        )
        return "ok", round((time.time() - start) * 1000, 1)
    except Exception:
        return "error", round((time.time() - start) * 1000, 1)


async def _check_worker(session: AsyncSession) -> tuple[str, float]:
    """Worker is ok if a job was picked up in the last 5 minutes."""
    start = time.time()
    try:
        result = await session.execute(
            text("SELECT MAX(started_at) AS last FROM jobs WHERE started_at IS NOT NULL")
        )
        row = result.mappings().first()
        elapsed = round((time.time() - start) * 1000, 1)
        if row is None or row["last"] is None:
            return "offline", elapsed
        from datetime import datetime, timezone
        last = row["last"]
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        age = (datetime.now(timezone.utc) - last).total_seconds()
        if age <= 300:
            return "ok", elapsed
        elif age <= 600:
            return "stale", elapsed
        return "offline", elapsed
    except Exception:
        return "error", round((time.time() - start) * 1000, 1)


async def _check_email() -> tuple[str, float]:
    start = time.time()
    try:
        from memra.app.core.config import get_settings
        settings = get_settings()
        if settings.email_backend == "console":
            return "ok", 0.0
        if settings.email_backend == "mailpit":
            import socket
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(_TIMEOUT)
            sock.connect((settings.mailpit_host, settings.mailpit_port))
            sock.close()
            return "ok", round((time.time() - start) * 1000, 1)
        # resend — just check if key is set
        if settings.resend_api_key:
            return "ok", 0.0
        return "error", 0.0
    except Exception:
        return "error", round((time.time() - start) * 1000, 1)


async def _check_storage() -> tuple[str, float]:
    start = time.time()
    try:
        from memra.app.core.config import get_settings
        settings = get_settings()
        if settings.storage_provider == "local":
            return "ok", 0.0
        if settings.supabase_storage_url and settings.supabase_storage_key:
            return "ok", 0.0
        return "error", 0.0
    except Exception:
        return "error", round((time.time() - start) * 1000, 1)


def _get_version() -> str:
    try:
        from importlib.metadata import version
        return version("memra")
    except Exception:
        return "dev"


@router.get("/detailed")
async def detailed_health(session: DBSession, admin: Admin):
    db_status, db_ms = await _check_db(session)
    qdrant_status, qdrant_ms = await _check_qdrant()
    worker_status, worker_ms = await _check_worker(session)
    email_status, email_ms = await _check_email()
    storage_status, storage_ms = await _check_storage()

    return {
        "api_server": "ok",
        "database": {"status": db_status, "response_ms": db_ms},
        "qdrant": {"status": qdrant_status, "response_ms": qdrant_ms},
        "worker": {"status": worker_status, "response_ms": worker_ms},
        "email": {"status": email_status, "response_ms": email_ms},
        "storage": {"status": storage_status, "response_ms": storage_ms},
        "uptime_seconds": round(time.time() - _start_time),
        "version": _get_version(),
    }
