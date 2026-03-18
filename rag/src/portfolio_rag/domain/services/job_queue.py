"""
Postgres-backed job queue
=========================

Module-level async functions for enqueue / dequeue / complete / fail / retry.
All functions accept an AsyncSession and are transaction-neutral — callers
are responsible for committing.

Dequeue uses FOR UPDATE SKIP LOCKED so multiple worker processes can poll
without stepping on each other.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from portfolio_rag.infrastructure.db.models.job import Job


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def enqueue(
    session: AsyncSession,
    job_type: str,
    payload: dict[str, Any],
    *,
    max_attempts: int = 3,
    delay_seconds: int = 0,
    org_id: uuid.UUID | None = None,
) -> str:
    """Insert a new job and return its UUID string."""
    scheduled_for = _now() + timedelta(seconds=delay_seconds)
    job = Job(
        type=job_type,
        payload=payload,
        max_attempts=max_attempts,
        scheduled_for=scheduled_for,
        org_id=org_id,
    )
    session.add(job)
    await session.flush()
    return str(job.id)


async def dequeue(session: AsyncSession, worker_id: str) -> dict | None:
    """
    Claim the next eligible job atomically via FOR UPDATE SKIP LOCKED.
    Returns a dict of column values, or None if the queue is empty.
    Callers must commit after this call to release the lock.
    """
    result = await session.execute(
        text(
            """
            UPDATE jobs SET
              status = 'running',
              started_at = now(),
              worker_id = :worker_id,
              attempts = attempts + 1
            WHERE id = (
              SELECT id FROM jobs
              WHERE status IN ('pending', 'retrying')
              AND scheduled_for <= now()
              ORDER BY created_at ASC
              LIMIT 1
              FOR UPDATE SKIP LOCKED
            )
            RETURNING *
            """
        ),
        {"worker_id": worker_id},
    )
    row = result.mappings().first()
    if row is None:
        return None
    return dict(row)


async def complete(session: AsyncSession, job_id: str) -> None:
    """Mark a job as done."""
    await session.execute(
        text(
            "UPDATE jobs SET status = 'done', finished_at = now() WHERE id = :id"
        ),
        {"id": uuid.UUID(job_id)},
    )


async def fail(session: AsyncSession, job_id: str, error: str, trace: str) -> None:
    """
    Record a failure.  If attempts < max_attempts, schedules a retry with
    exponential back-off (60 * 2^attempts seconds).  Otherwise marks failed.
    """
    result = await session.execute(
        text("SELECT attempts, max_attempts FROM jobs WHERE id = :id"),
        {"id": uuid.UUID(job_id)},
    )
    row = result.mappings().first()
    if row is None:
        return

    attempts = row["attempts"]
    max_attempts = row["max_attempts"]

    if attempts < max_attempts:
        delay = timedelta(seconds=60 * (2 ** attempts))
        new_status = "retrying"
        scheduled_for = _now() + delay
        await session.execute(
            text(
                """
                UPDATE jobs SET
                  status = :status,
                  error = :error,
                  error_trace = :trace,
                  finished_at = now(),
                  scheduled_for = :scheduled_for
                WHERE id = :id
                """
            ),
            {
                "id": uuid.UUID(job_id),
                "status": new_status,
                "error": error,
                "trace": trace,
                "scheduled_for": scheduled_for,
            },
        )
    else:
        await session.execute(
            text(
                """
                UPDATE jobs SET
                  status = 'failed',
                  error = :error,
                  error_trace = :trace,
                  finished_at = now()
                WHERE id = :id
                """
            ),
            {"id": uuid.UUID(job_id), "error": error, "trace": trace},
        )


async def get_stats(
    session: AsyncSession,
    *,
    org_id: uuid.UUID | None = None,
) -> dict:
    """Return job counts grouped by status, optionally scoped to an org."""
    if org_id is not None:
        result = await session.execute(
            text("SELECT status, COUNT(*) AS cnt FROM jobs WHERE org_id = :org_id GROUP BY status"),
            {"org_id": org_id},
        )
    else:
        result = await session.execute(
            text("SELECT status, COUNT(*) AS cnt FROM jobs GROUP BY status")
        )
    rows = result.mappings().all()
    stats: dict[str, int] = {
        "pending": 0, "running": 0, "done": 0, "failed": 0, "retrying": 0
    }
    for row in rows:
        stats[row["status"]] = row["cnt"]
    return stats


async def get_jobs(
    session: AsyncSession,
    *,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    org_id: uuid.UUID | None = None,
) -> list[dict]:
    """Return jobs ordered by created_at DESC with optional status/org filter."""
    conditions = []
    params: dict = {"limit": limit, "offset": offset}

    if status:
        conditions.append("status = :status")
        params["status"] = status
    if org_id is not None:
        conditions.append("org_id = :org_id")
        params["org_id"] = org_id

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    result = await session.execute(
        text(f"SELECT * FROM jobs {where} ORDER BY created_at DESC LIMIT :limit OFFSET :offset"),
        params,
    )
    return [dict(r) for r in result.mappings().all()]


async def retry(session: AsyncSession, job_id: str) -> None:
    """Reset a job to pending so the worker picks it up again."""
    await session.execute(
        text(
            """
            UPDATE jobs SET
              status = 'pending',
              attempts = 0,
              error = NULL,
              error_trace = NULL,
              scheduled_for = now()
            WHERE id = :id
            """
        ),
        {"id": uuid.UUID(job_id)},
    )
