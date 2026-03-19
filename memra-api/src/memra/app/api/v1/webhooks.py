"""Public webhook endpoints (no auth)."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from memra.app.core.config import get_settings, Settings
from memra.app.core.db import get_db_conn
from memra.domain.services.paystack_service import PaystackService
from memra.domain.services import platform_settings_service as pss
from memra.infrastructure.db.models.payment_event import PaymentEvent
from memra.infrastructure.db.models.subscription import Subscription
from memra.infrastructure.db.models.org import Organisation

logger = logging.getLogger(__name__)

router = APIRouter(tags=["webhooks"])


def _extract_metadata(payload_data: dict[str, Any]) -> dict[str, Any]:
    md = payload_data.get("metadata") or {}
    return md if isinstance(md, dict) else {}


def _extract_reference(payload_data: dict[str, Any]) -> str | None:
    ref = payload_data.get("reference")
    if isinstance(ref, str) and ref.strip():
        return ref.strip()
    # Some events nest it differently
    nested = payload_data.get("transaction") or payload_data.get("data") or {}
    if isinstance(nested, dict):
        ref = nested.get("reference")
        if isinstance(ref, str) and ref.strip():
            return ref.strip()
    return None


def _extract_plan_code(payload_data: dict[str, Any]) -> str | None:
    # Common patterns:
    # - data.plan.plan_code
    # - data.metadata.plan_code
    plan = payload_data.get("plan")
    if isinstance(plan, dict):
        v = plan.get("plan_code") or plan.get("planCode")
        if isinstance(v, str) and v.strip():
            return v.strip()

    md = _extract_metadata(payload_data)
    v = md.get("plan_code") or md.get("planCode")
    if isinstance(v, str) and v.strip():
        return v.strip()

    # sometimes directly
    v = payload_data.get("plan_code")
    if isinstance(v, str) and v.strip():
        return v.strip()
    return None


def _extract_subscription_code(payload_data: dict[str, Any]) -> str | None:
    for key in ("subscription_code", "subscriptionCode", "subscription"):
        v = payload_data.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
        if isinstance(v, dict):
            c = v.get("subscription_code") or v.get("code")
            if isinstance(c, str) and c.strip():
                return c.strip()
    return None


def _extract_email_token(payload_data: dict[str, Any]) -> str | None:
    for key in ("email_token", "emailToken", "token"):
        v = payload_data.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    # sometimes nested
    sub = payload_data.get("subscription") or {}
    if isinstance(sub, dict):
        v = sub.get("email_token")
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def _extract_customer_code(payload_data: dict[str, Any]) -> str | None:
    cust = payload_data.get("customer") or {}
    if isinstance(cust, dict):
        v = cust.get("customer_code") or cust.get("customerCode") or cust.get("code")
        if isinstance(v, str) and v.strip():
            return v.strip()
    v = payload_data.get("customer_code") or payload_data.get("customerCode") or payload_data.get("customer")
    if isinstance(v, str) and v.strip():
        return v.strip()
    return None


def _tier_from_plan_code(*, pro_code: str | None, enterprise_code: str | None, plan_code: str | None) -> str | None:
    if not plan_code:
        return None
    if pro_code and plan_code == pro_code:
        return "pro"
    if enterprise_code and plan_code == enterprise_code:
        return "enterprise"
    return None


@router.post("/webhooks/paystack", status_code=200)
async def paystack_webhook(
    request: Request,
    session: AsyncSession = Depends(get_db_conn),
    settings: Settings = Depends(get_settings),
):
    raw_body = await request.body()
    signature_header = request.headers.get("x-paystack-signature") or ""
    if not signature_header:
        # Paystack will retry if it doesn't consider the request valid; but we
        # still fail fast with 400 if signature header is missing.
        raise HTTPException(status_code=400, detail="Missing x-paystack-signature")

    svc = PaystackService(session=session, settings=settings)

    try:
        is_valid = await svc.verify_incoming_webhook_signature(
            raw_body=raw_body, signature_header=signature_header
        )
    except Exception as exc:
        logger.exception("Paystack signature verification failed: %s", exc)
        raise HTTPException(status_code=400, detail="Webhook signature verification error") from exc

    if not is_valid:
        raise HTTPException(status_code=400, detail="Invalid x-paystack-signature")

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except Exception as exc:
        logger.exception("Paystack webhook body was not valid JSON: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid webhook JSON") from exc

    event_type = payload.get("event")
    data = payload.get("data") or {}
    if not isinstance(data, dict):
        data = {}

    reference = _extract_reference(data)
    if not event_type or not isinstance(event_type, str) or not reference:
        raise HTTPException(status_code=400, detail="Webhook payload missing event/reference")

    # Resolve org_id as early as possible (best-effort, can be None).
    org_id: UUID | None = None
    md = _extract_metadata(data)
    maybe_org_id = md.get("org_id")
    if isinstance(maybe_org_id, str):
        try:
            org_id = UUID(maybe_org_id)
        except Exception:
            org_id = None

    # Payment-events is the audit/idempotency store.
    existing_res = await session.execute(
        select(PaymentEvent).where(PaymentEvent.paystack_reference == reference)
    )
    existing_row = existing_res.scalars().first()

    if existing_row and existing_row.processed:
        return {"ok": True}

    paystack_event_row = existing_row
    if not paystack_event_row:
        paystack_event_row = PaymentEvent(
            paystack_event=str(event_type),
            paystack_reference=reference,
            org_id=org_id,
            raw_payload=payload,
            processed=False,
        )
        session.add(paystack_event_row)
        await session.commit()

    # For plan mapping
    pro_plan_code = await pss.get_value(
        session, "paystack_pro_plan_code", settings.secret_key
    )
    enterprise_plan_code = await pss.get_value(
        session, "paystack_enterprise_plan_code", settings.secret_key
    )

    try:
        # We process event types in a best-effort way:
        # - Always mark payment_events.processed=true on success.
        # - Always return 200 to Paystack even if processing fails.
        if event_type == "charge.success":
            await _handle_charge_success(
                session=session,
                settings=settings,
                svc=svc,
                payload=payload,
                data=data,
                org_id=org_id,
                pro_plan_code=pro_plan_code,
                enterprise_plan_code=enterprise_plan_code,
            )

        elif event_type == "subscription.create":
            await _handle_subscription_create(
                session=session,
                settings=settings,
                payload=payload,
                data=data,
                org_id=org_id,
                pro_plan_code=pro_plan_code,
                enterprise_plan_code=enterprise_plan_code,
            )

        elif event_type == "subscription.not_renew":
            await _handle_subscription_not_renew(
                session=session,
                data=data,
                org_id=org_id,
            )

        elif event_type == "invoice.payment_failed":
            await _handle_invoice_payment_failed(
                session=session,
                data=data,
                org_id=org_id,
            )

        elif event_type == "invoice.update":
            await _handle_invoice_update(
                session=session,
                data=data,
                org_id=org_id,
            )

        elif event_type == "subscription.disable":
            await _handle_subscription_disable(
                session=session,
                data=data,
                org_id=org_id,
            )
        else:
            logger.info("Paystack webhook ignored event=%s", event_type)

        paystack_event_row.processed = True
        paystack_event_row.error = None
        await session.commit()

    except Exception as exc:
        logger.exception("Paystack webhook processing failed event=%s ref=%s", event_type, reference)
        paystack_event_row.error = str(exc)
        paystack_event_row.processed = False
        await session.commit()

    return {"ok": True}


async def _resolve_org_for_subscription(
    *, session: AsyncSession, org_id: UUID | None, payload_data: dict[str, Any]
) -> Organisation | None:
    if org_id:
        org_res = await session.execute(select(Organisation).where(Organisation.id == org_id))
        return org_res.scalars().first()

    cust_code = _extract_customer_code(payload_data)
    if cust_code:
        org_res = await session.execute(
            select(Organisation).where(Organisation.paystack_customer_code == cust_code)
        )
        return org_res.scalars().first()
    return None


async def _handle_charge_success(
    *,
    session: AsyncSession,
    settings: Settings,
    svc: PaystackService,
    payload: dict[str, Any],
    data: dict[str, Any],
    org_id: UUID | None,
    pro_plan_code: str | None,
    enterprise_plan_code: str | None,
) -> None:
    plan_code = _extract_plan_code(data)
    tier = _tier_from_plan_code(
        pro_code=pro_plan_code,
        enterprise_code=enterprise_plan_code,
        plan_code=plan_code,
    )

    subscription_code = _extract_subscription_code(data)
    customer_code = _extract_customer_code(data)
    email_token = _extract_email_token(data)

    org = await _resolve_org_for_subscription(
        session=session, org_id=org_id, payload_data=data
    )
    if not org:
        logger.warning("charge.success could not resolve org (org_id=%s)", org_id)
        return

    if customer_code and not org.paystack_customer_code:
        org.paystack_customer_code = customer_code

    # Fetch subscription details if we have a code but missing token/dates.
    sub_row: Subscription | None = None
    if subscription_code:
        sub_res = await session.execute(
            select(Subscription).where(Subscription.paystack_subscription_code == subscription_code)
        )
        sub_row = sub_res.scalars().first()

        if not sub_row:
            sub_row = Subscription(org_id=org.id, paystack_subscription_code=subscription_code)
            session.add(sub_row)
    else:
        # Charge success might not include subscription code depending on plan settings.
        # Fall back to the existing subscription row for the org.
        sub_res = await session.execute(select(Subscription).where(Subscription.org_id == org.id))
        sub_row = sub_res.scalars().first()
        if not sub_row:
            sub_row = Subscription(org_id=org.id)
            session.add(sub_row)

    # Ensure we have subscription details.
    if subscription_code and (not email_token or sub_row.current_period_end is None):
        details = await svc.fetch_subscription(subscription_code=subscription_code)
        email_token = email_token or details.get("email_token")
        sub_period_start = details.get("start_date") or details.get("current_period_start")
        sub_period_end = details.get("end_date") or details.get("current_period_end")
        status = details.get("status") or "active"
        plan_code = plan_code or (details.get("plan") or {}).get("plan_code")

        if sub_period_start:
            sub_row.current_period_start = sub_period_start
        if sub_period_end:
            sub_row.current_period_end = sub_period_end
        sub_row.status = status
        sub_row.paystack_plan_code = plan_code

    sub_row.paystack_customer_code = customer_code or sub_row.paystack_customer_code
    sub_row.paystack_email_token = email_token or sub_row.paystack_email_token

    # Update org plan (only if it's self-service; admin overrides must not be reverted).
    if tier and org.plan_source != "admin_override":
        org.plan = tier
        org.plan_source = "self_service"

    session.add(org)
    session.add(sub_row)
    await session.commit()


async def _handle_subscription_create(
    *,
    session: AsyncSession,
    settings: Settings,
    payload: dict[str, Any],
    data: dict[str, Any],
    org_id: UUID | None,
    pro_plan_code: str | None,
    enterprise_plan_code: str | None,
) -> None:
    subscription_code = _extract_subscription_code(data)
    customer_code = _extract_customer_code(data)
    email_token = _extract_email_token(data)

    plan = data.get("plan") or {}
    plan_code = plan.get("plan_code") if isinstance(plan, dict) else None
    tier = _tier_from_plan_code(
        pro_code=pro_plan_code,
        enterprise_code=enterprise_plan_code,
        plan_code=plan_code,
    )

    # period fields vary; store best-effort
    current_start = data.get("start") or data.get("current_period_start")
    current_end = data.get("next_payment_date") or data.get("end") or data.get("current_period_end")
    status = data.get("status") or "active"

    org = await _resolve_org_for_subscription(
        session=session, org_id=org_id, payload_data=data
    )
    if org and customer_code and not org.paystack_customer_code:
        org.paystack_customer_code = customer_code

    if not subscription_code:
        return

    sub_res = await session.execute(
        select(Subscription).where(Subscription.paystack_subscription_code == subscription_code)
    )
    sub_row = sub_res.scalars().first()
    if not sub_row:
        if not org:
            logger.warning("subscription.create could not resolve org for subscription_code=%s", subscription_code)
            return
        sub_row = Subscription(org_id=org.id, paystack_subscription_code=subscription_code)
        session.add(sub_row)

    sub_row.paystack_customer_code = customer_code or sub_row.paystack_customer_code
    sub_row.paystack_email_token = email_token or sub_row.paystack_email_token
    sub_row.paystack_plan_code = plan_code or sub_row.paystack_plan_code
    sub_row.status = status
    if current_start:
        sub_row.current_period_start = current_start
    if current_end:
        sub_row.current_period_end = current_end

    if org and tier and org.plan_source != "admin_override":
        org.plan = tier
        org.plan_source = "self_service"

    await session.commit()


async def _handle_subscription_not_renew(
    *, session: AsyncSession, data: dict[str, Any], org_id: UUID | None
) -> None:
    sub_code = _extract_subscription_code(data)
    status = "non_renewing"
    q = None
    if sub_code:
        q = await session.execute(select(Subscription).where(Subscription.paystack_subscription_code == sub_code))
    else:
        if org_id:
            q = await session.execute(select(Subscription).where(Subscription.org_id == org_id))
    sub_row = q.scalars().first() if q else None
    if not sub_row:
        return

    # Paystack typically provides next end date in this event
    current_end = data.get("next_payment_date") or data.get("end_date") or data.get("current_period_end")
    sub_row.status = status
    if current_end:
        sub_row.current_period_end = current_end
    await session.commit()


async def _handle_invoice_payment_failed(
    *, session: AsyncSession, data: dict[str, Any], org_id: UUID | None
) -> None:
    sub_code = _extract_subscription_code(data)
    q = None
    if sub_code:
        q = await session.execute(select(Subscription).where(Subscription.paystack_subscription_code == sub_code))
    else:
        if org_id:
            q = await session.execute(select(Subscription).where(Subscription.org_id == org_id))
    sub_row = q.scalars().first() if q else None
    if not sub_row:
        return

    sub_row.status = "attention"
    # best-effort: keep current_period_end as the grace basis
    current_end = data.get("next_payment_date") or data.get("end") or data.get("current_period_end")
    if current_end:
        sub_row.current_period_end = current_end
    await session.commit()


async def _handle_invoice_update(
    *, session: AsyncSession, data: dict[str, Any], org_id: UUID | None
) -> None:
    sub_code = _extract_subscription_code(data)
    q = None
    if sub_code:
        q = await session.execute(select(Subscription).where(Subscription.paystack_subscription_code == sub_code))
    else:
        if org_id:
            q = await session.execute(select(Subscription).where(Subscription.org_id == org_id))
    sub_row = q.scalars().first() if q else None
    if not sub_row:
        return

    status = "active"
    sub_row.status = status
    current_start = data.get("start_date") or data.get("current_period_start")
    current_end = data.get("end_date") or data.get("current_period_end")
    if current_start:
        sub_row.current_period_start = current_start
    if current_end:
        sub_row.current_period_end = current_end
    await session.commit()


async def _handle_subscription_disable(
    *, session: AsyncSession, data: dict[str, Any], org_id: UUID | None
) -> None:
    sub_code = _extract_subscription_code(data)
    q = None
    if sub_code:
        q = await session.execute(select(Subscription).where(Subscription.paystack_subscription_code == sub_code))
    else:
        if org_id:
            q = await session.execute(select(Subscription).where(Subscription.org_id == org_id))
    sub_row = q.scalars().first() if q else None

    if not sub_row:
        return

    sub_row.status = "cancelled"
    sub_row.cancelled_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await session.commit()

    # Downgrade org to free only if it wasn't admin overridden.
    org_res = await session.execute(select(Organisation).where(Organisation.id == sub_row.org_id))
    org_row = org_res.scalars().first()
    if org_row and org_row.plan_source == "self_service":
        org_row.plan = "free"
        org_row.plan_source = "self_service"
        await session.commit()

