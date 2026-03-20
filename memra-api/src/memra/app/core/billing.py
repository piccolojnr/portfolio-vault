"""Plan limits enforcement + paywall error schema."""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from typing import Any, Literal, Optional
from uuid import UUID

from fastapi import Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from sqlalchemy import text

from memra.app.core.db import get_db_conn
from memra.app.core.dependencies import get_current_user
from memra.app.core.config import Settings
from memra.app.core.dependencies import get_live_settings
from memra.infrastructure.db.models.org import Organisation
from memra.infrastructure.db.models.plan_limit import PlanLimit
from memra.infrastructure.db.models.model_plan_restriction import ModelPlanRestriction
from memra.infrastructure.db.models.subscription import Subscription


class PaywallError(Exception):
    """Raised to return a structured 402/403 paywall response."""

    def __init__(self, *, status_code: int, payload: dict[str, Any]):
        super().__init__(payload.get("code") or payload.get("error"))
        self.status_code = status_code
        self.payload = payload


def paywall_error_handler(request: Request, exc: PaywallError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=exc.payload)


_PLAN_ORDER = {"free": 0, "pro": 1, "enterprise": 2}
_CACHE_TTL_SECONDS = 60
_usage_cache: dict[tuple[str, str, str], tuple[float, int]] = {}


def _month_bounds(now: datetime) -> tuple[datetime, datetime]:
    # now is naive UTC
    start = datetime(now.year, now.month, 1)
    if now.month == 12:
        end = datetime(now.year + 1, 1, 1)
    else:
        end = datetime(now.year, now.month + 1, 1)
    return start, end


def _naive_utc(dt: datetime) -> datetime:
    # DB timestamps can be timezone-aware; normalize for naive UTC comparisons.
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def _tier_allows(current_plan: str, required_min_plan: str) -> bool:
    cur = _PLAN_ORDER.get(current_plan, 0)
    req = _PLAN_ORDER.get(required_min_plan, 0)
    return cur >= req


async def _compute_tokens_used_for_period(
    *,
    session: AsyncSession,
    org_id: UUID,
    period_start: datetime,
    period_end: datetime,
 ) -> int:
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
        {
            "org_id": org_id,
            "period_start": period_start,
            "period_end": period_end,
        },
    )
    row = res.mappings().first()
    return int(row["used_tokens"] if row else 0)


def _error_payload(
    *,
    error: str,
    code: str,
    limit: int,
    used: int,
    plan: str,
    status_code: Literal[402, 403],
    upgrade_url: str = "/settings/billing",
) -> PaywallError:
    return PaywallError(
        status_code=status_code,
        payload={
            "error": error,
            "code": code,
            "limit": limit,
            "used": used,
            "plan": plan,
            "upgrade_url": upgrade_url,
        },
    )


def enforce_plan_limits(
    *,
    check_documents: bool = False,
    check_members: bool = False,
    check_tokens: bool = True,
    check_models: bool = True,
):
    """Dependency factory to enforce plan limits + model access."""

    async def _inner(
        request: Request,
        session: AsyncSession = Depends(get_db_conn),
        current_user: dict = Depends(get_current_user),
        live_settings: Settings = Depends(get_live_settings),
    ) -> None:
        # Resolve org + plan tier.
        org_id = UUID(current_user["org_id"])
        org = (
            (await session.execute(select(Organisation).where(Organisation.id == org_id)))
            .scalars()
            .first()
        )
        if not org:
            return

        plan = org.plan

        plan_limit = (
            (await session.execute(select(PlanLimit).where(PlanLimit.plan_tier == plan)))
            .scalars()
            .first()
        )
        if not plan_limit:
            # Default safe behaviour: treat as free when missing config.
            plan = "free"
            plan_limit = (
                (await session.execute(select(PlanLimit).where(PlanLimit.plan_tier == "free")))
                .scalars()
                .first()
            )

        subscription = (
            (await session.execute(select(Subscription).where(Subscription.org_id == org_id)))
            .scalars()
            .first()
        )

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        period_start: datetime
        period_end: datetime
        if (
            subscription
            and subscription.current_period_start is not None
            and subscription.current_period_end is not None
        ):
            period_start = _naive_utc(subscription.current_period_start)
            period_end = _naive_utc(subscription.current_period_end)
        else:
            period_start, period_end = _month_bounds(now)

        # ── Subscription-status blocks (self_service only) ────────────────────
        if org.plan_source == "self_service" and subscription:
            if subscription.status == "non_renewing" and subscription.current_period_end is not None:
                current_period_end = _naive_utc(subscription.current_period_end)
                if now >= current_period_end:
                    # Fill token fields for the UI (best-effort).
                    used_tokens = 0
                    if check_tokens and plan_limit and plan_limit.monthly_token_limit is not None:
                        used_tokens = await _compute_tokens_used_for_period(
                            session=session,
                            org_id=org_id,
                            period_start=period_start,
                            period_end=period_end,
                        )
                    limit = int(plan_limit.monthly_token_limit or 0) if plan_limit and plan_limit.monthly_token_limit is not None else 0
                    raise _error_payload(
                        error="Subscription expired.",
                        code="subscription_expired",
                        limit=limit,
                        used=used_tokens,
                        plan=org.plan,
                        status_code=402,
                    )

            if subscription.status == "attention" and subscription.current_period_end is not None:
                current_period_end = _naive_utc(subscription.current_period_end)
                grace_end = current_period_end + timedelta(days=3)
                if now >= grace_end:
                    used_tokens = 0
                    if check_tokens and plan_limit and plan_limit.monthly_token_limit is not None:
                        used_tokens = await _compute_tokens_used_for_period(
                            session=session,
                            org_id=org_id,
                            period_start=period_start,
                            period_end=period_end,
                        )
                    limit = int(plan_limit.monthly_token_limit or 0) if plan_limit and plan_limit.monthly_token_limit is not None else 0
                    raise _error_payload(
                        error="Subscription past due.",
                        code="subscription_past_due",
                        limit=limit,
                        used=used_tokens,
                        plan=org.plan,
                        status_code=402,
                    )

        # ── Token limits ─────────────────────────────────────────────────────
        used_tokens: int = 0
        monthly_limit = plan_limit.monthly_token_limit if plan_limit else None
        if check_tokens and monthly_limit is not None:
            cache_key = (str(org_id), period_start.isoformat(), period_end.isoformat())
            now_ts = time.time()
            cached = _usage_cache.get(cache_key)
            if cached and cached[0] > now_ts:
                used_tokens = cached[1]
            else:
                used_tokens = await _compute_tokens_used_for_period(
                    session=session,
                    org_id=org_id,
                    period_start=period_start,
                    period_end=period_end,
                )
                _usage_cache[cache_key] = (now_ts + _CACHE_TTL_SECONDS, used_tokens)

            if used_tokens >= int(monthly_limit):
                raise _error_payload(
                    error="Token limit exceeded.",
                    code="token_limit_exceeded",
                    limit=int(monthly_limit),
                    used=used_tokens,
                    plan=org.plan,
                    status_code=402,
                )

        # ── Model restrictions ───────────────────────────────────────────────
        if check_models:
            models: list[str] = []
            if live_settings.anthropic_api_key:
                models.extend(
                    [live_settings.anthropic_model, live_settings.classifier_anthropic_model, live_settings.summarizer_anthropic_model]
                )
            if live_settings.openai_api_key:
                models.extend(
                    [live_settings.openai_model, live_settings.classifier_openai_model, live_settings.summarizer_openai_model, live_settings.embedding_model]
                )

            models = [m for m in models if m]
            if models:
                models = list(dict.fromkeys(models))  # stable unique
                q = await session.execute(
                    select(ModelPlanRestriction).where(
                        ModelPlanRestriction.model_id.in_(models),
                        ModelPlanRestriction.enabled == True,  # noqa: E712
                    )
                )
                rows = q.scalars().all()
                for row in rows:
                    if not _tier_allows(org.plan, row.min_plan):
                        raise _error_payload(
                            error="Requested model is not available for your plan.",
                            code="model_not_available",
                            limit=0,
                            used=0,
                            plan=org.plan,
                            status_code=403,
                        )

        # ── Document caps ────────────────────────────────────────────────────
        if check_documents and plan_limit and plan_limit.max_documents is not None:
            doc_count_res = await session.execute(
                text("SELECT COUNT(*) AS cnt FROM documents WHERE org_id = :org_id"),
                {"org_id": org_id},
            )
            used_docs = int(doc_count_res.mappings().first()["cnt"])
            if used_docs >= int(plan_limit.max_documents):
                raise _error_payload(
                    error="Document limit exceeded.",
                    code="document_limit_exceeded",
                    limit=int(plan_limit.max_documents),
                    used=used_docs,
                    plan=org.plan,
                    status_code=402,
                )

        # ── Member caps ──────────────────────────────────────────────────────
        if check_members and plan_limit and plan_limit.max_members is not None:
            member_count_res = await session.execute(
                text(
                    "SELECT COUNT(*) AS cnt FROM organisation_members WHERE org_id = :org_id"
                ),
                {"org_id": org_id},
            )
            used_members = int(member_count_res.mappings().first()["cnt"])
            if used_members >= int(plan_limit.max_members):
                raise _error_payload(
                    error="Member limit exceeded.",
                    code="member_limit_exceeded",
                    limit=int(plan_limit.max_members),
                    used=used_members,
                    plan=org.plan,
                    status_code=402,
                )

        return None

    return _inner

