"""Platform-admin billing management endpoints."""

from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from sqlalchemy import text

from memra.app.core.db import get_db_conn
from memra.app.core.platform_auth import get_platform_admin
from memra.infrastructure.db.models.plan_limit import PlanLimit
from memra.infrastructure.db.models.payment_event import PaymentEvent
from memra.infrastructure.db.models.subscription import Subscription
from memra.domain.services import audit

router = APIRouter(tags=["platform-admin-billing"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]
Admin = Annotated[dict, Depends(get_platform_admin)]


class PlanLimitUpdate(BaseModel):
    plan_tier: str
    monthly_token_limit: Optional[int] = None
    max_documents: Optional[int] = None
    max_corpora: Optional[int] = None
    max_members: Optional[int] = None
    overage_rate_per_500k_tokens: float = 0


@router.get("/billing/overview")
async def billing_overview(session: DBSession, admin: Admin):
    # Minimal overview; price/MRR is app-specific and not stored in this schema.
    active_count = (
        await session.execute(
            text("SELECT COUNT(*) AS cnt FROM subscriptions WHERE status = 'active'")
        )
    ).mappings().first()["cnt"]
    attention_count = (
        await session.execute(
            text("SELECT COUNT(*) AS cnt FROM subscriptions WHERE status = 'attention'")
        )
    ).mappings().first()["cnt"]

    return {
        "active_subscription_count": int(active_count or 0),
        "attention_count": int(attention_count or 0),
    }


@router.get("/plan-limits")
async def list_plan_limits(session: DBSession, admin: Admin):
    rows = (await session.execute(select(PlanLimit))).scalars().all()
    return [
        {
            "plan_tier": r.plan_tier,
            "monthly_token_limit": r.monthly_token_limit,
            "max_documents": r.max_documents,
            "max_corpora": r.max_corpora,
            "max_members": r.max_members,
            "overage_rate_per_500k_tokens": float(r.overage_rate_per_500k_tokens),
        }
        for r in rows
    ]


@router.put("/plan-limits")
async def update_plan_limits(
    body: list[PlanLimitUpdate],
    session: DBSession,
    admin: Admin,
):
    allowed = {"free", "pro", "enterprise"}
    for item in body:
        if item.plan_tier not in allowed:
            raise HTTPException(status_code=400, detail=f"Invalid plan tier: {item.plan_tier}")

        row = await session.get(PlanLimit, item.plan_tier)
        if not row:
            row = PlanLimit(plan_tier=item.plan_tier)
            session.add(row)

        row.monthly_token_limit = item.monthly_token_limit
        row.max_documents = item.max_documents
        row.max_corpora = item.max_corpora
        row.max_members = item.max_members
        row.overage_rate_per_500k_tokens = item.overage_rate_per_500k_tokens

        session.add(row)

    await session.commit()
    # Audit a single action for the whole batch update.
    try:
        await audit.log_action(
            session,
            admin_id=admin["sub"],
            action="plan_limits_update",
            target_type="plan_limits",
            target_id="batch",
            metadata={"count": len(body)},
        )
        await session.commit()
    except Exception:
        pass
    return {"status": "updated", "count": len(body)}


@router.get("/webhooks/payment-events")
async def list_payment_events(
    session: DBSession,
    admin: Admin,
    event_type: str | None = Query(None),
    processed: bool | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    where = ["1=1"]
    params: dict = {"limit": limit, "offset": offset}

    if event_type:
        where.append("paystack_event = :event_type")
        params["event_type"] = event_type
    if processed is not None:
        where.append("processed = :processed")
        params["processed"] = processed

    rows_res = await session.execute(
        text(
            f"""
            SELECT id, paystack_event, paystack_reference, org_id, processed, error, created_at, raw_payload
            FROM payment_events
            WHERE {' AND '.join(where)}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
            """
        ),
        params,
    )
    rows = rows_res.mappings().all()
    return [
        {
            "id": str(r["id"]),
            "paystack_event": r["paystack_event"],
            "paystack_reference": r["paystack_reference"],
            "org_id": str(r["org_id"]) if r["org_id"] else None,
            "processed": r["processed"],
            "error": r["error"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "raw_payload": r["raw_payload"],
        }
        for r in rows
    ]

