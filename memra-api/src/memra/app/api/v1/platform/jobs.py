"""
Platform Admin Jobs Router
============================

GET  /jobs           → all jobs (cross-org)
GET  /jobs/stats     → counts per status
POST /jobs/{id}/retry   → retry failed job
POST /jobs/{id}/cancel  → cancel pending/running job
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from memra.app.core.db import get_db_conn
from memra.app.core.platform_auth import get_platform_admin
from memra.domain.services import job_queue

router = APIRouter(prefix="/jobs", tags=["platform-admin-jobs"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]
Admin = Annotated[dict, Depends(get_platform_admin)]


@router.get("")
async def list_jobs(
    session: DBSession,
    admin: Admin,
    status: str | None = Query(None),
    job_type: str | None = Query(None, alias="type"),
    org_id: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
):
    offset = (page - 1) * limit
    conditions = []
    params: dict = {"limit": limit, "offset": offset}

    if status:
        conditions.append("j.status = :status")
        params["status"] = status
    if job_type:
        conditions.append("j.type = :type")
        params["type"] = job_type
    if org_id:
        conditions.append("j.org_id = :org_id")
        params["org_id"] = UUID(org_id)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    result = await session.execute(
        text(f"""
            SELECT j.*, o.name AS org_name
            FROM jobs j
            LEFT JOIN organisations o ON o.id = j.org_id
            {where}
            ORDER BY j.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )
    rows = result.mappings().all()

    count_result = await session.execute(
        text(f"SELECT COUNT(*) FROM jobs j {where}"),
        {k: v for k, v in params.items() if k not in ("limit", "offset")},
    )
    total = count_result.scalar() or 0

    return {
        "jobs": [_ser(dict(r)) for r in rows],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.get("/stats")
async def job_stats(session: DBSession, admin: Admin):
    stats = await job_queue.get_stats(session)
    return stats


@router.post("/{job_id}/retry", status_code=202)
async def retry_job(job_id: str, session: DBSession, admin: Admin):
    try:
        await job_queue.retry(session, job_id)
        await session.commit()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "queued"}


@router.post("/{job_id}/cancel", status_code=202)
async def cancel_job(job_id: str, session: DBSession, admin: Admin):
    try:
        await job_queue.cancel(session, job_id)
        await session.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "cancelled"}


def _ser(row: dict) -> dict:
    out = {}
    for k, v in row.items():
        if hasattr(v, "isoformat"):
            out[k] = v.isoformat()
        elif hasattr(v, "__str__") and not isinstance(v, (str, int, float, bool, dict, list, type(None))):
            out[k] = str(v)
        else:
            out[k] = v
    return out
