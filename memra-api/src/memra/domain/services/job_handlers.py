"""
Job handlers
============

One async function per job type.  Each handler receives the raw payload dict
and is responsible for its own DB/LLM calls.  Errors bubble up to the worker,
which records them via job_queue.fail().
"""

from __future__ import annotations

import logging
from uuid import UUID

logger = logging.getLogger(__name__)


async def handle_ingest_document(payload: dict) -> None:
    """
    payload: { "document_id": str, "corpus_id": str, "org_id": str }
    Delegates entirely to ingestion_service.ingest_document, which handles
    processing→ready/failed status transitions.
    """
    from memra.app.core.config import get_settings
    from memra.domain.services.ingestion_service import ingest_document

    doc_id = payload["document_id"]
    corpus_key = payload.get("corpus_id") or None
    org_id_str = payload.get("org_id")
    settings = get_settings()
    logger.info("[handler] ingest_document doc_id=%s corpus=%s", doc_id, corpus_key)
    import uuid as _uuid
    await ingest_document(doc_id, settings, corpus_key=corpus_key,
                          org_id=_uuid.UUID(org_id_str) if org_id_str else None)


async def handle_reingest_document(payload: dict) -> None:
    """
    payload: { "document_id": str, "corpus_id": str }
    Resets the lightrag_status to "pending" before re-running ingestion so the
    document appears as "processing" while the worker is active.

    TODO: Add per-document LightRAG graph node deletion when the library
    exposes a stable API for it.
    """
    from memra.app.core.config import get_settings
    from memra.app.core.db import open_db_engine
    from memra.domain.services import document as doc_svc
    from memra.domain.services.ingestion_service import ingest_document

    doc_id = payload["document_id"]
    settings = get_settings()

    # Reset status so the UI shows "processing" while the worker runs
    engine, factory = await open_db_engine(settings.database_url)
    try:
        async with factory() as session:
            try:
                doc = await doc_svc.get_document_by_id(session, doc_id)
            except LookupError:
                logger.warning("[handler] reingest_document: doc not found id=%s", doc_id)
                return
            doc.doc_metadata = {
                **(doc.doc_metadata or {}),
                "lightrag_status": "pending",
                "error": None,
            }
            session.add(doc)
            await session.commit()
    finally:
        await engine.dispose()

    corpus_key = payload.get("corpus_id") or None
    org_id_str = payload.get("org_id")
    logger.info("[handler] reingest_document doc_id=%s corpus=%s", doc_id, corpus_key)
    import uuid as _uuid
    await ingest_document(doc_id, settings, corpus_key=corpus_key,
                          org_id=_uuid.UUID(org_id_str) if org_id_str else None)


async def handle_summarise_conversation(payload: dict) -> None:
    """
    payload: {
        "conversation_id": str,
        "messages_to_summarise": [{"role": str, "content": str}, ...],
        "existing_summary": str,
        "newest_trimmed_id": str,
    }
    Builds a rolling summary and persists it to the conversation row.
    """
    from types import SimpleNamespace

    from memra.app.core.config import get_settings
    from memra.app.core.db import open_db_engine
    from memra.domain.services import conversations as conv_svc
    from memra.domain.services.summarizer import (
        _build_prompt,
        _summarise_with_anthropic,
        _summarise_with_openai,
    )

    conv_id = payload["conversation_id"]
    raw_messages = payload["messages_to_summarise"]
    existing_summary = payload.get("existing_summary") or None
    newest_trimmed_id = payload["newest_trimmed_id"]

    # Wrap raw dicts as SimpleNamespace so _build_prompt can use .role / .content
    messages = [SimpleNamespace(**m) for m in raw_messages]

    settings = get_settings()
    prompt = _build_prompt(messages, existing_summary)

    if settings.anthropic_api_key:
        new_summary, usage = await _summarise_with_anthropic(
            prompt, settings.anthropic_api_key, settings.summarizer_anthropic_model
        )
    else:
        new_summary, usage = await _summarise_with_openai(
            prompt, settings.openai_api_key, settings.summarizer_openai_model
        )

    org_id_str = payload.get("org_id")

    engine, factory = await open_db_engine(settings.database_url)
    try:
        async with factory() as session:
            await conv_svc.update_summary(
                session,
                UUID(conv_id),
                new_summary,
                UUID(newest_trimmed_id),
            )
            # Log AI call in the same transaction
            from memra.domain.services.ai_calls import log_call
            import uuid as _uuid
            await log_call(
                session, "summarise",
                model=usage["model"],
                provider=usage["provider"],
                input_tokens=usage.get("input_tokens"),
                output_tokens=usage.get("output_tokens"),
                conversation_id=conv_id,
                org_id=_uuid.UUID(org_id_str) if org_id_str else None,
            )
            await session.commit()
    finally:
        await engine.dispose()

    logger.info("[handler] summarise_conversation conv_id=%s", conv_id)


async def handle_billing_reconciliation(payload: dict) -> None:
    """Daily billing reconciliation.

    Downgrades self-service orgs when Paystack webhooks are missing/delayed:
      - non_renewing whose current_period_end has passed → free + subscription.cancelled
      - attention whose grace window (current_period_end + 3 days) has passed → free + subscription.cancelled

    Admin overrides (organisations.plan_source='admin_override') are never downgraded.
    """
    from datetime import datetime, timezone

    from sqlalchemy import text

    from memra.app.core.config import get_settings
    from memra.app.core.db import open_db_engine

    _ = payload  # reserved for future extensions
    settings = get_settings()
    if not settings.database_url:
        return

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    engine, factory = await open_db_engine(settings.database_url)

    try:
        async with factory() as session:
            # Non-renewing → free
            await session.execute(
                text(
                    """
                    UPDATE organisations o
                    SET plan = 'free',
                        plan_source = 'self_service',
                        updated_at = now()
                    WHERE o.plan_source = 'self_service'
                      AND EXISTS (
                        SELECT 1
                        FROM subscriptions s
                        WHERE s.org_id = o.id
                          AND s.status = 'non_renewing'
                          AND s.current_period_end IS NOT NULL
                          AND s.current_period_end < :now
                      )
                    """
                ),
                {"now": now},
            )

            await session.execute(
                text(
                    """
                    UPDATE subscriptions s
                    SET status = 'cancelled',
                        cancelled_at = :now,
                        updated_at = now()
                    WHERE s.status = 'non_renewing'
                      AND s.current_period_end IS NOT NULL
                      AND s.current_period_end < :now
                      AND EXISTS (
                        SELECT 1
                        FROM organisations o
                        WHERE o.id = s.org_id
                          AND o.plan_source = 'self_service'
                      )
                    """
                ),
                {"now": now},
            )

            # Attention → free (after grace)
            await session.execute(
                text(
                    """
                    UPDATE organisations o
                    SET plan = 'free',
                        plan_source = 'self_service',
                        updated_at = now()
                    WHERE o.plan_source = 'self_service'
                      AND EXISTS (
                        SELECT 1
                        FROM subscriptions s
                        WHERE s.org_id = o.id
                          AND s.status = 'attention'
                          AND s.current_period_end IS NOT NULL
                          AND (s.current_period_end + interval '3 days') < :now
                      )
                    """
                ),
                {"now": now},
            )

            await session.execute(
                text(
                    """
                    UPDATE subscriptions s
                    SET status = 'cancelled',
                        cancelled_at = :now,
                        updated_at = now()
                    WHERE s.status = 'attention'
                      AND s.current_period_end IS NOT NULL
                      AND (s.current_period_end + interval '3 days') < :now
                      AND EXISTS (
                        SELECT 1
                        FROM organisations o
                        WHERE o.id = s.org_id
                          AND o.plan_source = 'self_service'
                      )
                    """
                ),
                {"now": now},
            )

            await session.commit()
    finally:
        await engine.dispose()


# ── Email job handlers ─────────────────────────────────────────────────────────

async def handle_send_magic_link_email(payload: dict) -> None:
    """payload: {email, magic_link_url, expiry_minutes}"""
    from memra.infrastructure.email.backends import get_email_backend
    from memra.infrastructure.email.renderer import get_renderer

    try:
        renderer = get_renderer()
        backend = get_email_backend()
        msg = renderer.render(
            "magic_link.html",
            {
                "to": payload["email"],
                "magic_link_url": payload["magic_link_url"],
                "expiry_minutes": payload.get("expiry_minutes", 15),
            },
        )
        await backend.send(msg)
        logger.info("[handler] send_magic_link_email → %s", payload["email"])
    except Exception:
        logger.exception("[handler] send_magic_link_email failed for %s", payload.get("email"))


async def handle_send_verify_email(payload: dict) -> None:
    """payload: {email, verify_url, expiry_hours}"""
    from memra.infrastructure.email.backends import get_email_backend
    from memra.infrastructure.email.renderer import get_renderer

    try:
        renderer = get_renderer()
        backend = get_email_backend()
        msg = renderer.render(
            "verify_email.html",
            {
                "to": payload["email"],
                "verify_url": payload["verify_url"],
                "expiry_hours": payload.get("expiry_hours", 24),
            },
        )
        await backend.send(msg)
        logger.info("[handler] send_verify_email → %s", payload["email"])
    except Exception:
        logger.exception("[handler] send_verify_email failed for %s", payload.get("email"))


async def handle_send_welcome_email(payload: dict) -> None:
    """payload: {email, user_email, app_url, app_name}"""
    from memra.app.core.config import get_settings
    from memra.infrastructure.email.backends import get_email_backend
    from memra.infrastructure.email.renderer import get_renderer

    try:
        settings = get_settings()
        renderer = get_renderer()
        backend = get_email_backend()
        msg = renderer.render(
            "welcome.html",
            {
                "to": payload["email"],
                "user_email": payload.get("user_email", payload["email"]),
                "app_url": payload.get("app_url", settings.app_url),
                "app_name": payload.get("app_name", settings.app_name),
            },
        )
        await backend.send(msg)
        logger.info("[handler] send_welcome_email → %s", payload["email"])
    except Exception:
        logger.exception("[handler] send_welcome_email failed for %s", payload.get("email"))


async def handle_send_org_invite_email(payload: dict) -> None:
    """payload: {email, org_name, invite_url, invited_by_email, expiry_days, app_name}"""
    from memra.app.core.config import get_settings
    from memra.infrastructure.email.backends import get_email_backend
    from memra.infrastructure.email.renderer import get_renderer

    try:
        settings = get_settings()
        renderer = get_renderer()
        backend = get_email_backend()
        msg = renderer.render(
            "org_invite.html",
            {
                "to": payload["email"],
                "org_name": payload.get("org_name", ""),
                "invite_url": payload.get("invite_url", ""),
                "invited_by_email": payload.get("invited_by_email", ""),
                "expiry_days": payload.get("expiry_days", 7),
                "app_name": payload.get("app_name", settings.app_name),
            },
        )
        await backend.send(msg)
        logger.info("[handler] send_org_invite_email → %s", payload["email"])
    except Exception:
        logger.exception("[handler] send_org_invite_email failed for %s", payload.get("email"))


async def handle_send_password_reset_email(payload: dict) -> None:
    """payload: {email, reset_url, expiry_minutes}"""
    from memra.infrastructure.email.backends import get_email_backend
    from memra.infrastructure.email.renderer import get_renderer

    try:
        renderer = get_renderer()
        backend = get_email_backend()
        msg = renderer.render(
            "password_reset.html",
            {
                "to": payload["email"],
                "reset_url": payload["reset_url"],
                "expiry_minutes": payload.get("expiry_minutes", 30),
            },
        )
        await backend.send(msg)
        logger.info("[handler] send_password_reset_email → %s", payload["email"])
    except Exception:
        logger.exception("[handler] send_password_reset_email failed for %s", payload.get("email"))
