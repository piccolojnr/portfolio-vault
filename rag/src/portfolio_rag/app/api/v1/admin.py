"""
Admin Router
============

Endpoints for job queue monitoring and management.
All endpoints require owner or admin role and are scoped to the caller's org.

Prefix: /admin (mounted under /api/v1)
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from portfolio_rag.app.core.db import get_db_conn
from portfolio_rag.app.core.dependencies import require_role
from portfolio_rag.domain.services import job_queue

router = APIRouter(prefix="/admin", tags=["admin"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]
AdminUser = Annotated[dict, Depends(require_role("owner", "admin"))]

_WORKER_STALE_SECONDS = 60


@router.get("/jobs")
async def list_jobs(
    session: DBSession,
    current_user: AdminUser,
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    org_id = UUID(current_user["org_id"]) if current_user.get("org_id") else None
    jobs = await job_queue.get_jobs(
        session, status=status, limit=limit, offset=offset, org_id=org_id
    )
    return [_serialise_job(j) for j in jobs]


@router.get("/jobs/stats")
async def job_stats(session: DBSession, current_user: AdminUser):
    org_id = UUID(current_user["org_id"]) if current_user.get("org_id") else None
    stats = await job_queue.get_stats(session, org_id=org_id)

    # Determine worker_connected from MAX(started_at) scoped to this org
    if org_id is not None:
        result = await session.execute(
            text("SELECT MAX(started_at) AS last_started FROM jobs WHERE org_id = :org_id"),
            {"org_id": org_id},
        )
    else:
        result = await session.execute(
            text("SELECT MAX(started_at) AS last_started FROM jobs")
        )
    row = result.mappings().first()
    last_started = row["last_started"] if row else None

    worker_connected: bool | None = None
    if last_started is not None:
        now = datetime.now(timezone.utc)
        if last_started.tzinfo is None:
            from datetime import timezone as tz
            last_started = last_started.replace(tzinfo=tz.utc)
        age = (now - last_started).total_seconds()
        worker_connected = age <= _WORKER_STALE_SECONDS

    return {**stats, "worker_connected": worker_connected}


@router.post("/jobs/{job_id}/retry", status_code=202)
async def retry_job(job_id: str, session: DBSession, current_user: AdminUser):
    try:
        await job_queue.retry(session, job_id)
        await session.commit()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "queued"}


# ── AI calls ──────────────────────────────────────────────────────────────────

@router.get("/ai-calls")
async def list_ai_calls(
    session: DBSession,
    current_user: AdminUser,
    call_type: str | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    org_id = current_user.get("org_id")
    conditions = ["org_id = :org_id"] if org_id else []
    params: dict = {"limit": limit, "offset": offset}
    if org_id:
        params["org_id"] = UUID(org_id)
    if call_type:
        conditions.append("call_type = :call_type")
        params["call_type"] = call_type

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    result = await session.execute(
        text(f"""
            SELECT * FROM ai_calls
            {where}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )
    return [_serialise_job(dict(r)) for r in result.mappings().all()]


@router.get("/ai-calls/stats")
async def ai_call_stats(session: DBSession, current_user: AdminUser):
    org_id = current_user.get("org_id")
    where = "WHERE org_id = :org_id" if org_id else ""
    params = {"org_id": UUID(org_id)} if org_id else {}

    by_type = await session.execute(
        text(f"""
            SELECT call_type,
                   COUNT(*)           AS calls,
                   SUM(cost_usd)      AS cost_usd,
                   SUM(input_tokens)  AS input_tokens,
                   SUM(output_tokens) AS output_tokens
            FROM ai_calls
            {where}
            GROUP BY call_type
            ORDER BY cost_usd DESC NULLS LAST
        """),
        params,
    )
    totals = await session.execute(
        text(f"""
            SELECT COUNT(*) AS total_calls,
                   COALESCE(SUM(cost_usd), 0) AS total_cost_usd
            FROM ai_calls
            {where}
        """),
        params,
    )
    t = totals.mappings().first()
    return {
        "total_calls": t["total_calls"],
        "total_cost_usd": float(t["total_cost_usd"]),
        "by_type": [
            {
                "call_type": r["call_type"],
                "calls": r["calls"],
                "cost_usd": float(r["cost_usd"]) if r["cost_usd"] else 0.0,
                "input_tokens": r["input_tokens"] or 0,
                "output_tokens": r["output_tokens"] or 0,
            }
            for r in by_type.mappings().all()
        ],
    }


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
