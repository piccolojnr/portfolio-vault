"""Public webhook endpoints (no auth)."""

from __future__ import annotations

import json
import logging
import traceback
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

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


def _find_first_string_by_keys(payload: Any, keys: set[str]) -> str | None:
    """Recursively find the first non-empty string for any key in `keys`."""
    if isinstance(payload, dict):
        for k, v in payload.items():
            if k in keys and isinstance(v, str) and v.strip():
                return v.strip()
        for v in payload.values():
            found = _find_first_string_by_keys(v, keys)
            if found:
                return found
    elif isinstance(payload, list):
        for item in payload:
            found = _find_first_string_by_keys(item, keys)
            if found:
                return found
    return None


def _extract_metadata(payload_data: dict[str, Any]) -> dict[str, Any]:
    md = payload_data.get("metadata") or {}
    return md if isinstance(md, dict) else {}


def _extract_plan_code(payload_data: dict[str, Any]) -> str | None:
    # data.plan.plan_code (subscription/charge events)
    plan = payload_data.get("plan")
    if isinstance(plan, dict):
        v = plan.get("plan_code") or plan.get("planCode")
        if isinstance(v, str) and v.strip():
            return v.strip()

    md = _extract_metadata(payload_data)
    v = md.get("plan_code") or md.get("planCode")
    if isinstance(v, str) and v.strip():
        return v.strip()

    v = payload_data.get("plan_code")
    if isinstance(v, str) and v.strip():
        return v.strip()

    return _find_first_string_by_keys(payload_data, {"plan_code", "planCode"})


def _extract_subscription_code(payload_data: dict[str, Any]) -> str | None:
    for key in ("subscription_code", "subscriptionCode", "subscription"):
        v = payload_data.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
        if isinstance(v, dict):
            c = v.get("subscription_code") or v.get("code")
            if isinstance(c, str) and c.strip():
                return c.strip()
    return _find_first_string_by_keys(
        payload_data,
        {"subscription_code", "subscriptionCode"},
    )


def _extract_email_token(payload_data: dict[str, Any]) -> str | None:
    for key in ("email_token", "emailToken", "token"):
        v = payload_data.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    sub = payload_data.get("subscription") or {}
    if isinstance(sub, dict):
        v = sub.get("email_token")
        if isinstance(v, str) and v.strip():
            return v.strip()
    return _find_first_string_by_keys(
        payload_data,
        {"email_token", "emailToken"},
    )


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


def _webhook_safe_context(*, data: dict[str, Any], org_id: UUID | None) -> dict[str, Any]:
    """Minimal, non-sensitive fields for DEBUG logs (no tokens / full payloads)."""
    return {
        "org_id": str(org_id) if org_id else None,
        "has_subscription_code": bool(_extract_subscription_code(data)),
        "has_customer_code": bool(_extract_customer_code(data)),
        "has_plan_code": bool(_extract_plan_code(data)),
        "has_email_token": bool(_extract_email_token(data)),
    }


def _parse_dt(value: Any) -> datetime | None:
    """Parse an ISO 8601 string or pass through a datetime object.

    Paystack sends dates as strings like '2026-04-20T02:41:00.000Z'.
    SQLAlchemy DateTime columns require actual datetime objects.
    Returns None if value is None or unparseable.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            # Normalize to naive UTC to match the rest of the codebase.
            return dt.astimezone(timezone.utc).replace(tzinfo=None)
        except (ValueError, TypeError):
            logger.warning("[paystack.webhook] could not parse datetime value: %r", value)
            return None
    return None


def _derive_idempotency_key(event_type: str, data: dict[str, Any]) -> str:
    """Return a stable idempotency key for the payment_events table.

    Priority:
    1. data.reference              — charge events (unique transaction reference)
    2. {event_type}:{invoice_code} — invoice events (unique per invoice per event type)
    3. {event_type}:{sub_code}     — subscription events (unique per lifecycle point)
    4. {event_type}:{uuid}         — fallback (not retry-safe; logged as warning)
    """
    ref = data.get("reference")
    if isinstance(ref, str) and ref.strip():
        return ref.strip()

    invoice_code = data.get("invoice_code")
    if isinstance(invoice_code, str) and invoice_code.strip():
        return f"{event_type}:{invoice_code.strip()}"

    sub_code = _extract_subscription_code(data)
    if sub_code:
        return f"{event_type}:{sub_code}"

    fallback = f"{event_type}:{uuid4()}"
    logger.warning(
        "[paystack.webhook] could not derive stable idempotency key for event=%s, using fallback=%s",
        event_type,
        fallback,
    )
    return fallback


@router.post("/webhooks/paystack", status_code=200)
async def paystack_webhook(
    request: Request,
    session: AsyncSession = Depends(get_db_conn),
    settings: Settings = Depends(get_settings),
):
    raw_body = await request.body()
    signature_header = request.headers.get("x-paystack-signature") or ""
    logger.info(
        "[paystack.webhook] inbound bytes=%d has_signature=%s",
        len(raw_body),
        bool(signature_header),
    )

    if not signature_header:
        logger.warning("[paystack.webhook] reject 400 missing x-paystack-signature")
        raise HTTPException(status_code=400, detail="Missing x-paystack-signature")

    svc = PaystackService(session=session, settings=settings)

    try:
        is_valid = await svc.verify_incoming_webhook_signature(
            raw_body=raw_body, signature_header=signature_header
        )
    except Exception as exc:
        logger.warning("[paystack.webhook] reject 400 signature verify error: %s", exc, exc_info=True)
        raise HTTPException(status_code=400, detail="Webhook signature verification error") from exc

    if not is_valid:
        logger.warning("[paystack.webhook] reject 400 invalid x-paystack-signature")
        raise HTTPException(status_code=400, detail="Invalid x-paystack-signature")

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except Exception as exc:
        logger.warning("[paystack.webhook] reject 400 invalid JSON: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid webhook JSON") from exc

    event_type = payload.get("event")
    if not event_type or not isinstance(event_type, str):
        logger.warning("[paystack.webhook] reject 400 missing event field")
        raise HTTPException(status_code=400, detail="Webhook payload missing event")

    data = payload.get("data") or {}
    print("data:", data)
    print("event_type:", event_type)
    if not isinstance(data, dict):
        data = {}

    idempotency_key = _derive_idempotency_key(event_type, data)

    # Resolve org_id best-effort from metadata.
    org_id: UUID | None = None
    md = _extract_metadata(data)
    maybe_org_id = md.get("org_id")
    if isinstance(maybe_org_id, str):
        try:
            org_id = UUID(maybe_org_id)
        except Exception:
            pass

    ctx = _webhook_safe_context(data=data, org_id=org_id)
    logger.info(
        "[paystack.webhook] parsed event=%s key=%s ctx=%s",
        event_type,
        idempotency_key,
        ctx,
    )

    # Payment-events is the audit/idempotency store.
    existing_res = await session.execute(
        select(PaymentEvent).where(PaymentEvent.paystack_reference == idempotency_key)
    )
    existing_row = existing_res.scalars().first()

    if existing_row and existing_row.processed:
        logger.info(
            "[paystack.webhook] 200 idempotent skip event=%s key=%s payment_event_id=%s",
            event_type,
            idempotency_key,
            existing_row.id,
        )
        return {"ok": True}

    paystack_event_row = existing_row
    if not paystack_event_row:
        paystack_event_row = PaymentEvent(
            paystack_event=str(event_type),
            paystack_reference=idempotency_key,
            org_id=org_id,
            raw_payload=payload,
            processed=False,
        )
        session.add(paystack_event_row)
        await session.commit()
        logger.info(
            "[paystack.webhook] created payment_event id=%s event=%s key=%s org_id=%s",
            paystack_event_row.id,
            event_type,
            idempotency_key,
            org_id,
        )
    else:
        logger.info(
            "[paystack.webhook] reusing payment_event id=%s event=%s key=%s processed=%s",
            paystack_event_row.id,
            event_type,
            idempotency_key,
            paystack_event_row.processed,
        )

    # Fetch plan codes for tier mapping.
    pro_plan_code = await pss.get_value(
        session,
        "paystack_pro_plan_code",
        settings.secret_key,
        fallback_settings=settings,
    )
    enterprise_plan_code = await pss.get_value(
        session,
        "paystack_enterprise_plan_code",
        settings.secret_key,
        fallback_settings=settings,
    )

    try:
        logger.info("[paystack.webhook] handler_start event=%s key=%s", event_type, idempotency_key)

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

        elif event_type in ("invoice.create", "invoice.created"):
            await _handle_invoice_created(
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

        elif event_type == "subscription.enable":
            await _handle_subscription_enable(
                session=session,
                data=data,
                org_id=org_id,
                pro_plan_code=pro_plan_code,
                enterprise_plan_code=enterprise_plan_code,
            )

        else:
            logger.info(
                "[paystack.webhook] no_handler event=%s key=%s ctx=%s",
                event_type,
                idempotency_key,
                ctx,
            )

        paystack_event_row.processed = True
        paystack_event_row.error = None
        await session.commit()
        logger.info(
            "[paystack.webhook] 200 handler_ok event=%s key=%s payment_event_id=%s",
            event_type,
            idempotency_key,
            paystack_event_row.id,
        )

    except Exception as exc:
        logger.exception(
            "[paystack.webhook] handler exception event=%s key=%s: %s",
            event_type,
            idempotency_key,
            exc,
        )
        # Rollback any failed transaction before writing the error state,
        # otherwise SQLAlchemy raises PendingRollbackError on the next commit.
        await session.rollback()
        paystack_event_row.error = str(exc)
        paystack_event_row.processed = False
        session.add(paystack_event_row)
        await session.commit()
        logger.info(
            "[paystack.webhook] 200 handler_fail (processed=false) payment_event_id=%s",
            paystack_event_row.id,
        )

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

    # Look up subscription: by subscription_code first, then fall back to org (unique per org).
    sub_row: Subscription | None = None
    if subscription_code:
        sub_res = await session.execute(
            select(Subscription).where(Subscription.paystack_subscription_code == subscription_code)
        )
        sub_row = sub_res.scalars().first()

    if not sub_row:
        org_sub_res = await session.execute(
            select(Subscription).where(Subscription.org_id == org.id)
        )
        sub_row = org_sub_res.scalars().first()

    if not sub_row:
        sub_row = Subscription(
            org_id=org.id,
            paystack_subscription_code=subscription_code or None,
        )
        session.add(sub_row)

    # Fetch subscription details from Paystack if we're missing period dates or email token.
    if subscription_code and (not email_token or sub_row.current_period_end is None):
        details = await svc.fetch_subscription(subscription_code=subscription_code)
        email_token = email_token or details.get("email_token")
        sub_period_start = details.get("start_date") or details.get("current_period_start")
        sub_period_end = details.get("next_payment_date") or details.get("end_date") or details.get("current_period_end")
        status = details.get("status") or "active"
        plan_code = plan_code or (details.get("plan") or {}).get("plan_code")

        if sub_period_start:
            sub_row.current_period_start = _parse_dt(sub_period_start)
        if sub_period_end:
            sub_row.current_period_end = _parse_dt(sub_period_end)
        sub_row.status = status
        sub_row.paystack_plan_code = plan_code

    sub_row.paystack_customer_code = customer_code or sub_row.paystack_customer_code
    sub_row.paystack_email_token = email_token or sub_row.paystack_email_token

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
    if not plan_code:
        plan_code = _extract_plan_code(data)
    tier = _tier_from_plan_code(
        pro_code=pro_plan_code,
        enterprise_code=enterprise_plan_code,
        plan_code=plan_code,
    )

    # subscription.create payload: next_payment_date = period end; createdAt = period start
    current_start = data.get("createdAt") or data.get("created_at") or data.get("start") or data.get("current_period_start")
    current_end = data.get("next_payment_date") or data.get("end") or data.get("current_period_end")
    status = data.get("status") or "active"

    org = await _resolve_org_for_subscription(
        session=session, org_id=org_id, payload_data=data
    )
    if org and customer_code and not org.paystack_customer_code:
        org.paystack_customer_code = customer_code

    if not subscription_code:
        return

    if not org:
        logger.warning(
            "subscription.create could not resolve org for subscription_code=%s", subscription_code
        )
        return

    # Look up subscription: by subscription_code first, then fall back to org (unique per org).
    sub_res = await session.execute(
        select(Subscription).where(Subscription.paystack_subscription_code == subscription_code)
    )
    sub_row = sub_res.scalars().first()

    if not sub_row:
        org_sub_res = await session.execute(
            select(Subscription).where(Subscription.org_id == org.id)
        )
        sub_row = org_sub_res.scalars().first()

    if not sub_row:
        sub_row = Subscription(org_id=org.id, paystack_subscription_code=subscription_code)
        session.add(sub_row)

    sub_row.paystack_subscription_code = subscription_code or sub_row.paystack_subscription_code
    sub_row.paystack_customer_code = customer_code or sub_row.paystack_customer_code
    sub_row.paystack_email_token = email_token or sub_row.paystack_email_token
    sub_row.paystack_plan_code = plan_code or sub_row.paystack_plan_code
    sub_row.status = status
    if current_start:
        sub_row.current_period_start = _parse_dt(current_start)
    if current_end:
        sub_row.current_period_end = _parse_dt(current_end)

    if org and tier and org.plan_source != "admin_override":
        org.plan = tier
        org.plan_source = "self_service"

    await session.commit()


async def _handle_subscription_not_renew(
    *, session: AsyncSession, data: dict[str, Any], org_id: UUID | None
) -> None:
    sub_code = _extract_subscription_code(data)
    q = None
    if sub_code:
        q = await session.execute(
            select(Subscription).where(Subscription.paystack_subscription_code == sub_code)
        )
    elif org_id:
        q = await session.execute(select(Subscription).where(Subscription.org_id == org_id))
    sub_row = q.scalars().first() if q else None
    if not sub_row:
        return

    sub_row.status = "non_renewing"
    current_end = data.get("next_payment_date") or data.get("end_date") or data.get("current_period_end")
    if current_end:
        sub_row.current_period_end = _parse_dt(current_end)
    await session.commit()


async def _handle_invoice_payment_failed(
    *, session: AsyncSession, data: dict[str, Any], org_id: UUID | None
) -> None:
    sub_code = _extract_subscription_code(data)
    email_token = _extract_email_token(data)
    q = None
    if sub_code:
        q = await session.execute(
            select(Subscription).where(Subscription.paystack_subscription_code == sub_code)
        )
    elif org_id:
        q = await session.execute(select(Subscription).where(Subscription.org_id == org_id))
    sub_row = q.scalars().first() if q else None
    if not sub_row:
        return

    sub_row.status = "attention"
    if email_token:
        sub_row.paystack_email_token = email_token
    # invoice events use period_end for the grace basis
    current_end = data.get("period_end") or data.get("next_payment_date") or data.get("current_period_end")
    if current_end:
        sub_row.current_period_end = _parse_dt(current_end)
    await session.commit()


async def _handle_invoice_update(
    *, session: AsyncSession, data: dict[str, Any], org_id: UUID | None
) -> None:
    sub_code = _extract_subscription_code(data)
    email_token = _extract_email_token(data)
    q = None
    if sub_code:
        q = await session.execute(
            select(Subscription).where(Subscription.paystack_subscription_code == sub_code)
        )
    elif org_id:
        q = await session.execute(select(Subscription).where(Subscription.org_id == org_id))
    sub_row = q.scalars().first() if q else None
    if not sub_row:
        return

    # Map Paystack invoice status to subscription status
    raw_status = data.get("status") or ""
    sub_row.status = "active" if raw_status in ("success", "paid", "active") else (raw_status or "active")
    if email_token:
        sub_row.paystack_email_token = email_token
    # invoice events use period_start / period_end (not start_date / end_date)
    current_start = data.get("period_start") or data.get("start_date") or data.get("current_period_start")
    current_end = data.get("period_end") or data.get("end_date") or data.get("current_period_end")
    if current_start:
        sub_row.current_period_start = _parse_dt(current_start)
    if current_end:
        sub_row.current_period_end = _parse_dt(current_end)
    await session.commit()


async def _handle_invoice_created(
    *, session: AsyncSession, data: dict[str, Any], org_id: UUID | None
) -> None:
    sub_code = _extract_subscription_code(data)
    email_token = _extract_email_token(data)
    if not sub_code or not email_token:
        return

    sub_res = await session.execute(
        select(Subscription).where(Subscription.paystack_subscription_code == sub_code)
    )
    sub_row = sub_res.scalars().first()
    if not sub_row and org_id:
        org_sub_res = await session.execute(
            select(Subscription).where(Subscription.org_id == org_id)
        )
        sub_row = org_sub_res.scalars().first()

    if not sub_row and org_id:
        sub_row = Subscription(
            org_id=org_id,
            paystack_subscription_code=sub_code,
            paystack_email_token=email_token,
        )
        session.add(sub_row)
        await session.commit()
        return

    if not sub_row:
        return

    sub_row.paystack_email_token = email_token
    if not sub_row.paystack_subscription_code:
        sub_row.paystack_subscription_code = sub_code

    # Update period dates from the invoice if available
    current_start = data.get("period_start")
    current_end = data.get("period_end")
    if current_start:
        sub_row.current_period_start = _parse_dt(current_start)
    if current_end:
        sub_row.current_period_end = _parse_dt(current_end)

    await session.commit()


async def _handle_subscription_disable(
    *, session: AsyncSession, data: dict[str, Any], org_id: UUID | None
) -> None:
    sub_code = _extract_subscription_code(data)
    q = None
    if sub_code:
        q = await session.execute(
            select(Subscription).where(Subscription.paystack_subscription_code == sub_code)
        )
    elif org_id:
        q = await session.execute(select(Subscription).where(Subscription.org_id == org_id))
    sub_row = q.scalars().first() if q else None

    if not sub_row:
        return

    email_token = _extract_email_token(data)
    sub_row.status = "cancelled"
    sub_row.cancelled_at = datetime.now(timezone.utc).replace(tzinfo=None)
    if email_token:
        sub_row.paystack_email_token = email_token
    await session.commit()

    # Downgrade org to free only if it wasn't admin overridden.
    org_res = await session.execute(select(Organisation).where(Organisation.id == sub_row.org_id))
    org_row = org_res.scalars().first()
    if org_row and org_row.plan_source == "self_service":
        org_row.plan = "free"
        await session.commit()


async def _handle_subscription_enable(
    *,
    session: AsyncSession,
    data: dict[str, Any],
    org_id: UUID | None,
    pro_plan_code: str | None,
    enterprise_plan_code: str | None,
) -> None:
    sub_code = _extract_subscription_code(data)
    q = None
    if sub_code:
        q = await session.execute(select(Subscription).where(Subscription.paystack_subscription_code == sub_code))
    elif org_id:
        q = await session.execute(select(Subscription).where(Subscription.org_id == org_id))
    sub_row = q.scalars().first() if q else None
    if not sub_row:
        return

    email_token = _extract_email_token(data)
    sub_row.status = "active"
    sub_row.cancelled_at = None
    if email_token:
        sub_row.paystack_email_token = email_token
    await session.commit()

    # Re-upgrade org plan if it was downgraded by the disable webhook.
    org_res = await session.execute(select(Organisation).where(Organisation.id == sub_row.org_id))
    org_row = org_res.scalars().first()
    if not org_row or org_row.plan_source != "self_service":
        return

    plan_code = sub_row.paystack_plan_code or _extract_plan_code(data)
    tier = _tier_from_plan_code(
        pro_code=pro_plan_code, enterprise_code=enterprise_plan_code, plan_code=plan_code,
    )
    if tier:
        org_row.plan = tier
        await session.commit()
