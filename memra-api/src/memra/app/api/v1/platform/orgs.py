"""
Platform Admin Organisations Router
=====================================

GET  /orgs                  → paginated org list
GET  /orgs/{org_id}         → org detail + members + usage
POST /orgs/{org_id}/plan    → change org plan
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from memra.app.core.db import get_db_conn
from memra.app.core.platform_auth import get_platform_admin
from memra.domain.services import audit
from memra.infrastructure.db.models.subscription import Subscription
from memra.infrastructure.db.models.payment_event import PaymentEvent

router = APIRouter(prefix="/orgs", tags=["platform-admin-orgs"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]
Admin = Annotated[dict, Depends(get_platform_admin)]


class ChangePlanRequest(BaseModel):
    plan: str


@router.get("")
async def list_orgs(
    session: DBSession,
    admin: Admin,
    search: str | None = Query(None),
    plan: str | None = Query(None),
    sort: str = Query("cost"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    offset = (page - 1) * limit
    conditions = []
    params: dict = {"limit": limit, "offset": offset}

    if search:
        conditions.append("o.name ILIKE :search")
        params["search"] = f"%{search}%"
    if plan:
        conditions.append("o.plan = :plan")
        params["plan"] = plan

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    order_map = {
        "cost": "tokens_used_this_month DESC NULLS LAST",
        "members": "member_count DESC",
        "created": "o.created_at DESC",
    }
    order_by = order_map.get(sort, "tokens_used_this_month DESC NULLS LAST")

    result = await session.execute(
        text(f"""
            SELECT o.id, o.name, o.slug, o.plan, o.created_at,
                   (SELECT COUNT(*) FROM organisation_members om WHERE om.org_id = o.id) AS member_count,
                   (SELECT COUNT(*) FROM corpora c WHERE c.org_id = o.id) AS corpus_count,
                   (SELECT COALESCE(SUM(COALESCE(a.input_tokens, 0) + COALESCE(a.output_tokens, 0)), 0)
                    FROM ai_calls a WHERE a.org_id = o.id
                      AND a.created_at >= date_trunc('month', now())
                   ) AS tokens_used_this_month,
                   (SELECT COALESCE(SUM(a.cost_usd), 0)
                    FROM ai_calls a WHERE a.org_id = o.id
                      AND a.created_at >= date_trunc('month', now())
                   ) AS cost_usd_this_month
            FROM organisations o
            {where}
            ORDER BY {order_by}
            LIMIT :limit OFFSET :offset
        """),
        params,
    )
    rows = result.mappings().all()

    count_result = await session.execute(
        text(f"SELECT COUNT(*) FROM organisations o {where}"),
        {k: v for k, v in params.items() if k not in ("limit", "offset")},
    )
    total = count_result.scalar() or 0

    return {
        "orgs": [_ser(dict(r)) for r in rows],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.get("/{org_id}")
async def get_org(org_id: str, session: DBSession, admin: Admin):
    oid = UUID(org_id)

    org = (await session.execute(
        text("SELECT * FROM organisations WHERE id = :id"), {"id": oid}
    )).mappings().first()
    if org is None:
        raise HTTPException(status_code=404, detail="Organisation not found")

    members = await session.execute(
        text("""
            SELECT u.id AS user_id, u.email, u.display_name, om.role, om.joined_at
            FROM organisation_members om
            JOIN users u ON u.id = om.user_id
            WHERE om.org_id = :oid
        """),
        {"oid": oid},
    )

    usage = await session.execute(
        text("""
            SELECT call_type,
                   COUNT(*) AS calls,
                   COALESCE(SUM(input_tokens), 0) AS input_tokens,
                   COALESCE(SUM(output_tokens), 0) AS output_tokens,
                   COALESCE(SUM(cost_usd), 0) AS cost_usd
            FROM ai_calls
            WHERE org_id = :oid
              AND created_at >= date_trunc('month', now())
            GROUP BY call_type
        """),
        {"oid": oid},
    )

    return {
        "org": _ser(dict(org)),
        "members": [
            {
                "user_id": str(m["user_id"]),
                "email": m["email"],
                "display_name": m["display_name"],
                "role": m["role"],
                "joined_at": m["joined_at"].isoformat() if m["joined_at"] else None,
            }
            for m in members.mappings().all()
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


@router.post("/{org_id}/plan")
async def change_plan(
    org_id: str,
    body: ChangePlanRequest,
    request: Request,
    session: DBSession,
    admin: Admin,
):
    if body.plan not in ("free", "pro", "enterprise"):
        raise HTTPException(status_code=400, detail="Invalid plan tier")

    oid = UUID(org_id)
    result = await session.execute(
        text(
            """
            UPDATE organisations
            SET plan = :plan,
                plan_source = 'admin_override',
                updated_at = now()
            WHERE id = :id
            RETURNING id
            """
        ),
        {"plan": body.plan, "id": oid},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Organisation not found")

    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    await audit.log_action(
        session, admin_id=admin["sub"], action="plan_change",
        target_type="org", target_id=org_id,
        metadata={"new_plan": body.plan}, ip_address=ip,
    )
    await session.commit()
    return {"status": "updated", "plan": body.plan}


@router.get("/{org_id}/billing")
async def get_org_billing(org_id: str, session: DBSession, admin: Admin):
    oid = UUID(org_id)

    org = (await session.execute(text("SELECT * FROM organisations WHERE id = :id"), {"id": oid})).mappings().first()
    if org is None:
        raise HTTPException(status_code=404, detail="Organisation not found")

    subscription = (await session.execute(
        select(Subscription).where(Subscription.org_id == oid)
    )).scalars().first()

    payment_events = (await session.execute(
        select(PaymentEvent)
        .where(PaymentEvent.org_id == oid)
        .order_by(PaymentEvent.created_at.desc())
        .limit(20)
    )).scalars().all()

    return {
        "org": {
            "id": str(org["id"]),
            "plan": org["plan"],
            "plan_source": org.get("plan_source") if isinstance(org, dict) else None,
        },
        "subscription": (
            {
                "status": subscription.status,
                "paystack_subscription_code": subscription.paystack_subscription_code,
                "paystack_customer_code": subscription.paystack_customer_code,
                "paystack_plan_code": subscription.paystack_plan_code,
                "current_period_start": subscription.current_period_start.isoformat()
                if subscription and subscription.current_period_start
                else None,
                "current_period_end": subscription.current_period_end.isoformat()
                if subscription and subscription.current_period_end
                else None,
                "cancelled_at": subscription.cancelled_at.isoformat()
                if subscription and subscription.cancelled_at
                else None,
            }
            if subscription
            else None
        ),
        "payment_events": [
            {
                "id": str(e.id),
                "paystack_event": e.paystack_event,
                "paystack_reference": e.paystack_reference,
                "processed": e.processed,
                "error": e.error,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in payment_events
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
