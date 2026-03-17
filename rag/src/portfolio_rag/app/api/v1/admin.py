"""
Admin Router
============

Endpoints for job queue monitoring and management.

Prefix: /admin (mounted under /api/v1)
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from portfolio_rag.app.core.db import get_db_conn
from portfolio_rag.domain.services import job_queue

router = APIRouter(prefix="/admin", tags=["admin"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]

_WORKER_STALE_SECONDS = 60


@router.get("/jobs")
async def list_jobs(
    session: DBSession,
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    jobs = await job_queue.get_jobs(session, status=status, limit=limit, offset=offset)
    # Serialise UUIDs and datetimes
    return [_serialise_job(j) for j in jobs]


@router.get("/jobs/stats")
async def job_stats(session: DBSession):
    stats = await job_queue.get_stats(session)

    # Determine worker_connected from MAX(started_at) of any job
    result = await session.execute(
        text("SELECT MAX(started_at) AS last_started FROM jobs")
    )
    row = result.mappings().first()
    last_started = row["last_started"] if row else None

    worker_connected: bool | None = None
    if last_started is not None:
        now = datetime.now(timezone.utc)
        # Ensure last_started is tz-aware
        if last_started.tzinfo is None:
            from datetime import timezone as tz
            last_started = last_started.replace(tzinfo=tz.utc)
        age = (now - last_started).total_seconds()
        worker_connected = age <= _WORKER_STALE_SECONDS

    return {**stats, "worker_connected": worker_connected}


@router.post("/jobs/{job_id}/retry", status_code=202)
async def retry_job(job_id: str, session: DBSession):
    try:
        await job_queue.retry(session, job_id)
        await session.commit()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "queued"}


# ── Serialisation helper ───────────────────────────────────────────────────────

def _serialise_job(job: dict) -> dict:
    out = {}
    for k, v in job.items():
        if hasattr(v, "isoformat"):
            out[k] = v.isoformat()
        elif hasattr(v, "__str__") and not isinstance(v, (str, int, float, bool, dict, list, type(None))):
            out[k] = str(v)
        else:
            out[k] = v
    return out
