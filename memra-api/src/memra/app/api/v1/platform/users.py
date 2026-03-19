"""
Platform Admin Users Router
=============================

GET  /users                     → paginated user list
GET  /users/{user_id}           → user detail + org memberships + usage
POST /users/{user_id}/disable   → disable user
POST /users/{user_id}/enable    → enable user
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from memra.app.core.db import get_db_conn
from memra.app.core.platform_auth import get_platform_admin
from memra.domain.services import audit

router = APIRouter(prefix="/users", tags=["platform-admin-users"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]
Admin = Annotated[dict, Depends(get_platform_admin)]


@router.get("")
async def list_users(
    session: DBSession,
    admin: Admin,
    search: str | None = Query(None),
    plan: str | None = Query(None),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    offset = (page - 1) * limit
    conditions = []
    params: dict = {"limit": limit, "offset": offset}

    if search:
        conditions.append("u.email ILIKE :search")
        params["search"] = f"%{search}%"
    if status == "disabled":
        conditions.append("u.disabled = true")
    elif status == "active":
        conditions.append("u.disabled = false")
    if plan:
        conditions.append("EXISTS (SELECT 1 FROM organisation_members om JOIN organisations o ON o.id = om.org_id WHERE om.user_id = u.id AND o.plan = :plan)")
        params["plan"] = plan

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    result = await session.execute(
        text(f"""
            SELECT u.id, u.email, u.display_name, u.disabled, u.created_at,
                   (SELECT COUNT(*) FROM organisation_members om WHERE om.user_id = u.id) AS org_count,
                   (SELECT o.plan FROM organisation_members om
                    JOIN organisations o ON o.id = om.org_id
                    WHERE om.user_id = u.id LIMIT 1) AS plan,
                   (SELECT COALESCE(SUM(COALESCE(a.input_tokens, 0) + COALESCE(a.output_tokens, 0)), 0)
                    FROM ai_calls a
                    WHERE a.user_id = u.id
                      AND a.created_at >= date_trunc('month', now())
                   ) AS tokens_used_this_month,
                   (SELECT MAX(a.created_at) FROM ai_calls a WHERE a.user_id = u.id) AS last_active_at
            FROM users u
            {where}
            ORDER BY u.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )
    rows = result.mappings().all()

    count_result = await session.execute(
        text(f"SELECT COUNT(*) AS total FROM users u {where}"),
        {k: v for k, v in params.items() if k not in ("limit", "offset")},
    )
    total = count_result.scalar() or 0

    return {
        "users": [_serialize_user(dict(r)) for r in rows],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.get("/{user_id}")
async def get_user(user_id: str, session: DBSession, admin: Admin):
    uid = UUID(user_id)

    user_result = await session.execute(
        text("SELECT * FROM users WHERE id = :id"), {"id": uid}
    )
    user = user_result.mappings().first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    memberships = await session.execute(
        text("""
            SELECT o.id AS org_id, o.name, o.slug, o.plan, om.role, om.joined_at
            FROM organisation_members om
            JOIN organisations o ON o.id = om.org_id
            WHERE om.user_id = :uid
        """),
        {"uid": uid},
    )

    usage = await session.execute(
        text("""
            SELECT call_type,
                   COUNT(*) AS calls,
                   COALESCE(SUM(input_tokens), 0) AS input_tokens,
                   COALESCE(SUM(output_tokens), 0) AS output_tokens,
                   COALESCE(SUM(cost_usd), 0) AS cost_usd
            FROM ai_calls
            WHERE user_id = :uid
              AND created_at >= date_trunc('month', now())
            GROUP BY call_type
        """),
        {"uid": uid},
    )

    return {
        "user": _serialize_user(dict(user)),
        "memberships": [
            {
                "org_id": str(m["org_id"]),
                "name": m["name"],
                "slug": m["slug"],
                "plan": m["plan"],
                "role": m["role"],
                "joined_at": m["joined_at"].isoformat() if m["joined_at"] else None,
            }
            for m in memberships.mappings().all()
        ],
        "usage_this_month": [
            {
                "call_type": u["call_type"],
                "calls": u["calls"],
                "input_tokens": u["input_tokens"],
                "output_tokens": u["output_tokens"],
                "cost_usd": float(u["cost_usd"]),
            }
            for u in usage.mappings().all()
        ],
    }


@router.post("/{user_id}/disable")
async def disable_user(
    user_id: str, request: Request, session: DBSession, admin: Admin,
):
    uid = UUID(user_id)
    result = await session.execute(
        text("UPDATE users SET disabled = true WHERE id = :id RETURNING id"),
        {"id": uid},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="User not found")

    # Revoke all refresh tokens
    await session.execute(
        text("UPDATE refresh_tokens SET revoked = true WHERE user_id = :uid"),
        {"uid": uid},
    )

    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    await audit.log_action(
        session, admin_id=admin["sub"], action="user_disable",
        target_type="user", target_id=user_id, ip_address=ip,
    )
    await session.commit()
    return {"status": "disabled"}


@router.post("/{user_id}/enable")
async def enable_user(
    user_id: str, request: Request, session: DBSession, admin: Admin,
):
    uid = UUID(user_id)
    result = await session.execute(
        text("UPDATE users SET disabled = false WHERE id = :id RETURNING id"),
        {"id": uid},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="User not found")

    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    await audit.log_action(
        session, admin_id=admin["sub"], action="user_enable",
        target_type="user", target_id=user_id, ip_address=ip,
    )
    await session.commit()
    return {"status": "enabled"}


def _serialize_user(row: dict) -> dict:
    out = {}
    for k, v in row.items():
        if hasattr(v, "isoformat"):
            out[k] = v.isoformat()
        elif hasattr(v, "__str__") and not isinstance(v, (str, int, float, bool, dict, list, type(None))):
            out[k] = str(v)
        else:
            out[k] = v
    return out
