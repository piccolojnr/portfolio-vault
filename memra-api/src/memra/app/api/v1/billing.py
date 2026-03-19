"""Self-service billing endpoints for org owners."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from sqlalchemy import text

from memra.app.core.config import Settings, get_settings
from memra.app.core.db import get_db_conn
from memra.app.core.dependencies import get_current_user, get_live_settings, require_role
from memra.domain.services.paystack_service import PaystackService
from memra.domain.services import platform_settings_service as pss
from memra.infrastructure.db.models.org import Organisation
from memra.infrastructure.db.models.plan_limit import PlanLimit
from memra.infrastructure.db.models.payment_event import PaymentEvent
from memra.infrastructure.db.models.subscription import Subscription

router = APIRouter(prefix="/billing", tags=["billing"])

DBSession = AsyncSession


def _month_bounds(now: datetime) -> tuple[datetime, datetime]:
    start = datetime(now.year, now.month, 1)
    if now.month == 12:
        end = datetime(now.year + 1, 1, 1)
    else:
        end = datetime(now.year, now.month + 1, 1)
    return start, end


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class SubscribeRequest(BaseModel):
    plan: str


@router.get("")
async def get_billing(
    session: DBSession = Depends(get_db_conn),
    current_user: dict = Depends(get_current_user),
    settings: Settings = Depends(get_live_settings),
):
    org_id = UUID(current_user["org_id"])

    org = (await session.execute(select(Organisation).where(Organisation.id == org_id))).scalars().first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")

    plan_limit = (await session.execute(select(PlanLimit).where(PlanLimit.plan_tier == org.plan))).scalars().first()
    if not plan_limit:
        plan_limit = (await session.execute(select(PlanLimit).where(PlanLimit.plan_tier == "free"))).scalars().first()

    subscription = (await session.execute(select(Subscription).where(Subscription.org_id == org_id))).scalars().first()

    now = _utcnow_naive()
    if subscription and subscription.current_period_start and subscription.current_period_end:
        period_start = subscription.current_period_start
        period_end = subscription.current_period_end
    else:
        period_start, period_end = _month_bounds(now)

    used_tokens = 0
    if plan_limit and plan_limit.monthly_token_limit is not None:
        res = await session.execute(
            text(
                """
                SELECT
                  COALESCE(SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)), 0) AS used_tokens
                FROM ai_calls
                WHERE org_id = :org_id
                  AND created_at >= :period_start
                  AND created_at < :period_end
                """
            ),
            {"org_id": org_id, "period_start": period_start, "period_end": period_end},
        )
        row = res.mappings().first()
        used_tokens = int(row["used_tokens"] if row else 0)

    # Limits usage overview
    doc_count_res = await session.execute(
        text("SELECT COUNT(*) AS cnt FROM documents WHERE org_id = :org_id"),
        {"org_id": org_id},
    )
    used_docs = int(doc_count_res.mappings().first()["cnt"])

    corpora_count_res = await session.execute(
        text("SELECT COUNT(*) AS cnt FROM corpora WHERE org_id = :org_id"),
        {"org_id": org_id},
    )
    used_corpora = int(corpora_count_res.mappings().first()["cnt"])

    member_count_res = await session.execute(
        text(
            "SELECT COUNT(*) AS cnt FROM organisation_members WHERE org_id = :org_id"
        ),
        {"org_id": org_id},
    )
    used_members = int(member_count_res.mappings().first()["cnt"])

    return {
        "org_id": str(org_id),
        "plan": org.plan,
        "plan_source": org.plan_source,
        "subscription_status": subscription.status if subscription else None,
        "period": {
            "current_period_start": period_start.isoformat() if period_start else None,
            "current_period_end": period_end.isoformat() if period_end else None,
        },
        "usage": {
            "tokens_used": used_tokens,
            "monthly_token_limit": plan_limit.monthly_token_limit if plan_limit else None,
        },
        "limits": {
            "documents": {
                "used": used_docs,
                "max": plan_limit.max_documents if plan_limit else None,
            },
            "corpora": {
                "used": used_corpora,
                "max": plan_limit.max_corpora if plan_limit else None,
            },
            "members": {
                "used": used_members,
                "max": plan_limit.max_members if plan_limit else None,
            },
        },
        "next_billing_date": subscription.current_period_end.isoformat() if subscription and subscription.current_period_end else None,
    }


@router.post("/subscribe")
async def subscribe(
    body: SubscribeRequest,
    session: DBSession = Depends(get_db_conn),
    current_user: dict = Depends(require_role("owner")),
    settings: Settings = Depends(get_live_settings),
):
    tier = body.plan
    if tier not in ("pro", "enterprise"):
        raise HTTPException(status_code=400, detail="Invalid plan tier")

    org_id = UUID(current_user["org_id"])
    org = (await session.execute(select(Organisation).where(Organisation.id == org_id))).scalars().first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")

    email = current_user.get("email") or ""
    if not email:
        raise HTTPException(status_code=400, detail="Missing owner email in token")

    paystack = PaystackService(session=session, settings=settings)
    callback_url = f"{settings.app_url}/api/billing/callback"

    result = await paystack.initialize_subscription_transaction(
        email=email,
        tier=tier,
        callback_url=callback_url,
        metadata={"org_id": str(org_id), "tier": tier},
    )

    # Mark plan source as self_service; access still depends on webhooks.
    org.plan_source = "self_service"
    await session.commit()

    return {"authorization_url": result.authorization_url}


@router.post("/cancel")
async def cancel_subscription(
    session: DBSession = Depends(get_db_conn),
    current_user: dict = Depends(require_role("owner")),
    settings: Settings = Depends(get_live_settings),
):
    org_id = UUID(current_user["org_id"])
    org = (await session.execute(select(Organisation).where(Organisation.id == org_id))).scalars().first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")

    subscription = (await session.execute(select(Subscription).where(Subscription.org_id == org_id))).scalars().first()
    if not subscription or not subscription.paystack_subscription_code or not subscription.paystack_email_token:
        # Nothing to cancel; treat as no-op.
        return {"status": "no_subscription"}

    paystack = PaystackService(session=session, settings=settings)
    await paystack.disable_subscription(
        subscription_code=subscription.paystack_subscription_code,
        email_token=subscription.paystack_email_token,
    )

    return {"status": "cancel_queued"}


@router.get("/history")
async def billing_history(
    session: DBSession = Depends(get_db_conn),
    current_user: dict = Depends(get_current_user),
):
    org_id = UUID(current_user["org_id"])
    rows_res = await session.execute(
        select(PaymentEvent)
        .where(PaymentEvent.org_id == org_id)
        .order_by(PaymentEvent.created_at.desc())
        .limit(50)
    )
    rows = rows_res.scalars().all()
    return [
        {
            "id": str(r.id),
            "paystack_event": r.paystack_event,
            "paystack_reference": r.paystack_reference,
            "processed": r.processed,
            "error": r.error,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.api_route("/callback", methods=["GET", "POST"])
async def billing_callback(
    request: Request,
    reference: str,
    session: DBSession = Depends(get_db_conn),
    settings: Settings = Depends(get_live_settings),
):
    # Paystack passes `reference` as part of the callback URL. This endpoint
    # verifies payment best-effort and relies on webhooks for final state.
    paystack = PaystackService(session=session, settings=settings)
    try:
        await paystack.verify_transaction(reference=reference)
    except Exception:
        # Webhooks are the source of truth; redirect success anyway.
        pass

    return RedirectResponse(url=f"{settings.app_url}/settings/billing?payment=success")

