"""
Platform Admin API Call Logs Router
=====================================

GET  /logs          → paginated, filtered log list
GET  /logs/summary  → aggregated by call_type and org
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from memra.app.core.db import get_db_conn
from memra.app.core.platform_auth import get_platform_admin

router = APIRouter(prefix="/logs", tags=["platform-admin-logs"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]
Admin = Annotated[dict, Depends(get_platform_admin)]


@router.get("")
async def list_logs(
    session: DBSession,
    admin: Admin,
    org_id: str | None = Query(None),
    user_id: str | None = Query(None),
    call_type: list[str] | None = Query(None),
    date_from: str | None = Query(None, alias="from"),
    date_to: str | None = Query(None, alias="to"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
):
    offset = (page - 1) * limit
    conditions = []
    params: dict = {"limit": limit, "offset": offset}

    if org_id:
        conditions.append("a.org_id = :org_id")
        params["org_id"] = UUID(org_id)
    if user_id:
        conditions.append("a.user_id = :user_id")
        params["user_id"] = UUID(user_id)
    if call_type:
        conditions.append("a.call_type = ANY(:call_types)")
        params["call_types"] = call_type
    if date_from:
        conditions.append("a.created_at >= :date_from")
        params["date_from"] = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
    if date_to:
        conditions.append("a.created_at <= :date_to")
        params["date_to"] = datetime.fromisoformat(date_to.replace("Z", "+00:00"))

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    result = await session.execute(
        text(f"""
            SELECT a.id, a.org_id, a.user_id, a.call_type, a.model, a.provider,
                   a.input_tokens, a.output_tokens, a.cost_usd, a.duration_ms,
                   a.created_at,
                   o.name AS org_name,
                   u.email AS user_email
            FROM ai_calls a
            LEFT JOIN organisations o ON o.id = a.org_id
            LEFT JOIN users u ON u.id = a.user_id
            {where}
            ORDER BY a.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )
    rows = result.mappings().all()

    # Total cost for current filter
    cost_result = await session.execute(
        text(f"SELECT COALESCE(SUM(a.cost_usd), 0) AS total_cost FROM ai_calls a {where}"),
        {k: v for k, v in params.items() if k not in ("limit", "offset")},
    )
    total_cost = float(cost_result.scalar() or 0)

    count_result = await session.execute(
        text(f"SELECT COUNT(*) FROM ai_calls a {where}"),
        {k: v for k, v in params.items() if k not in ("limit", "offset")},
    )
    total = count_result.scalar() or 0

    return {
        "logs": [_ser(dict(r)) for r in rows],
        "total": total,
        "total_cost": total_cost,
        "page": page,
        "limit": limit,
    }


@router.get("/summary")
async def logs_summary(
    session: DBSession,
    admin: Admin,
    date_from: str | None = Query(None, alias="from"),
    date_to: str | None = Query(None, alias="to"),
):
    conditions = []
    params: dict = {}

    if date_from:
        conditions.append("a.created_at >= :date_from")
        params["date_from"] = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
    if date_to:
        conditions.append("a.created_at <= :date_to")
        params["date_to"] = datetime.fromisoformat(date_to.replace("Z", "+00:00"))

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    by_type = await session.execute(
        text(f"""
            SELECT a.call_type,
                   COUNT(*) AS calls,
                   COALESCE(SUM(a.input_tokens), 0) AS input_tokens,
                   COALESCE(SUM(a.output_tokens), 0) AS output_tokens,
                   COALESCE(SUM(a.cost_usd), 0) AS cost_usd
            FROM ai_calls a
            {where}
            GROUP BY a.call_type
            ORDER BY cost_usd DESC
        """),
        params,
    )

    by_org = await session.execute(
        text(f"""
            SELECT a.org_id, o.name AS org_name,
                   COUNT(*) AS calls,
                   COALESCE(SUM(a.cost_usd), 0) AS cost_usd
            FROM ai_calls a
            LEFT JOIN organisations o ON o.id = a.org_id
            {where}
            GROUP BY a.org_id, o.name
            ORDER BY cost_usd DESC
        """),
        params,
    )

    return {
        "by_type": [
            {
                "call_type": r["call_type"],
                "calls": r["calls"],
                "input_tokens": r["input_tokens"],
                "output_tokens": r["output_tokens"],
                "cost_usd": float(r["cost_usd"]),
            }
            for r in by_type.mappings().all()
        ],
        "by_org": [
            {
                "org_id": str(r["org_id"]) if r["org_id"] else None,
                "org_name": r["org_name"],
                "calls": r["calls"],
                "cost_usd": float(r["cost_usd"]),
            }
            for r in by_org.mappings().all()
        ],
    }


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
