"""
Platform Admin Analytics Router
=================================

GET  /analytics/overview  → summary stats
GET  /analytics/daily     → daily breakdown
GET  /analytics/by-org    → per-org usage
GET  /analytics/by-type   → per call_type breakdown
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from memra.app.core.db import get_db_conn
from memra.app.core.platform_auth import get_platform_admin

router = APIRouter(prefix="/analytics", tags=["platform-admin-analytics"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]
Admin = Annotated[dict, Depends(get_platform_admin)]


@router.get("/overview")
async def overview(session: DBSession, admin: Admin):
    r = await session.execute(text("""
        SELECT
            (SELECT COUNT(*) FROM users) AS total_users,
            (SELECT COUNT(*) FROM organisations) AS total_orgs,
            (SELECT COUNT(*) FROM ai_calls WHERE created_at >= CURRENT_DATE) AS total_api_calls_today,
            (SELECT COALESCE(SUM(cost_usd), 0) FROM ai_calls WHERE created_at >= CURRENT_DATE) AS total_cost_today,
            (SELECT COALESCE(SUM(cost_usd), 0) FROM ai_calls WHERE created_at >= date_trunc('month', now())) AS total_cost_this_month,
            (SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE) AS new_users_today,
            (SELECT COUNT(*) FROM organisations WHERE created_at >= CURRENT_DATE) AS new_orgs_today,
            (SELECT COUNT(DISTINCT user_id) FROM ai_calls WHERE created_at >= CURRENT_DATE AND user_id IS NOT NULL) AS active_users_today
    """))
    row = r.mappings().first()
    return {
        "total_users": row["total_users"],
        "total_orgs": row["total_orgs"],
        "total_api_calls_today": row["total_api_calls_today"],
        "total_cost_today": float(row["total_cost_today"]),
        "total_cost_this_month": float(row["total_cost_this_month"]),
        "new_users_today": row["new_users_today"],
        "new_orgs_today": row["new_orgs_today"],
        "active_users_today": row["active_users_today"],
    }


@router.get("/daily")
async def daily(
    session: DBSession,
    admin: Admin,
    days: int = Query(30, ge=1, le=365),
):
    result = await session.execute(
        text("""
            SELECT d::date AS date,
                   COUNT(a.id) AS calls,
                   COALESCE(SUM(a.input_tokens), 0) AS input_tokens,
                   COALESCE(SUM(a.output_tokens), 0) AS output_tokens,
                   COALESCE(SUM(a.cost_usd), 0) AS cost_usd
            FROM generate_series(
                CURRENT_DATE - :days * INTERVAL '1 day',
                CURRENT_DATE,
                '1 day'
            ) AS d
            LEFT JOIN ai_calls a ON a.created_at::date = d::date
            GROUP BY d::date
            ORDER BY d::date
        """),
        {"days": days},
    )
    return [
        {
            "date": str(r["date"]),
            "calls": r["calls"],
            "input_tokens": r["input_tokens"],
            "output_tokens": r["output_tokens"],
            "cost_usd": float(r["cost_usd"]),
        }
        for r in result.mappings().all()
    ]


@router.get("/by-org")
async def by_org(
    session: DBSession,
    admin: Admin,
    days: int = Query(30, ge=1, le=365),
):
    result = await session.execute(
        text("""
            SELECT a.org_id, o.name AS org_name, o.plan,
                   COUNT(*) AS calls,
                   COALESCE(SUM(a.input_tokens), 0) AS input_tokens,
                   COALESCE(SUM(a.output_tokens), 0) AS output_tokens,
                   COALESCE(SUM(a.cost_usd), 0) AS cost_usd
            FROM ai_calls a
            LEFT JOIN organisations o ON o.id = a.org_id
            WHERE a.created_at >= CURRENT_DATE - :days * INTERVAL '1 day'
            GROUP BY a.org_id, o.name, o.plan
            ORDER BY cost_usd DESC
        """),
        {"days": days},
    )
    return [
        {
            "org_id": str(r["org_id"]) if r["org_id"] else None,
            "org_name": r["org_name"],
            "plan": r["plan"],
            "calls": r["calls"],
            "input_tokens": r["input_tokens"],
            "output_tokens": r["output_tokens"],
            "cost_usd": float(r["cost_usd"]),
        }
        for r in result.mappings().all()
    ]


@router.get("/by-type")
async def by_type(
    session: DBSession,
    admin: Admin,
    days: int = Query(30, ge=1, le=365),
):
    result = await session.execute(
        text("""
            SELECT call_type,
                   COUNT(*) AS calls,
                   COALESCE(SUM(input_tokens), 0) AS input_tokens,
                   COALESCE(SUM(output_tokens), 0) AS output_tokens,
                   COALESCE(SUM(cost_usd), 0) AS cost_usd
            FROM ai_calls
            WHERE created_at >= CURRENT_DATE - :days * INTERVAL '1 day'
            GROUP BY call_type
            ORDER BY cost_usd DESC
        """),
        {"days": days},
    )
    return [
        {
            "call_type": r["call_type"],
            "calls": r["calls"],
            "input_tokens": r["input_tokens"],
            "output_tokens": r["output_tokens"],
            "cost_usd": float(r["cost_usd"]),
        }
        for r in result.mappings().all()
    ]


@router.get("/daily-by-type")
async def daily_by_type(
    session: DBSession,
    admin: Admin,
    days: int = Query(30, ge=1, le=365),
):
    """Daily breakdown stacked by call_type — used for the dashboard chart."""
    result = await session.execute(
        text("""
            SELECT a.created_at::date AS date, a.call_type,
                   COUNT(*) AS calls,
                   COALESCE(SUM(a.cost_usd), 0) AS cost_usd
            FROM ai_calls a
            WHERE a.created_at >= CURRENT_DATE - :days * INTERVAL '1 day'
            GROUP BY a.created_at::date, a.call_type
            ORDER BY date
        """),
        {"days": days},
    )
    return [
        {
            "date": str(r["date"]),
            "call_type": r["call_type"],
            "calls": r["calls"],
            "cost_usd": float(r["cost_usd"]),
        }
        for r in result.mappings().all()
    ]
