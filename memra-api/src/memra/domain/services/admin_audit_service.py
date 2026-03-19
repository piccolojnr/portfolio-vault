"""
Platform Admin Audit Query Service
===================================

Read/query helpers for admin audit logs used by platform admin API.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


def _serialize_value(value: Any) -> Any:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if hasattr(value, "__str__") and not isinstance(
        value, (str, int, float, bool, dict, list, type(None))
    ):
        return str(value)
    return value


def _serialize_row(row: dict[str, Any]) -> dict[str, Any]:
    return {key: _serialize_value(val) for key, val in row.items()}


def _build_where(
    *,
    q: str | None,
    admin_id: str | None,
    action: str | None,
    target_type: str | None,
    target_id: str | None,
    date_from: str | None,
    date_to: str | None,
) -> tuple[str, dict[str, Any]]:
    conditions: list[str] = []
    params: dict[str, Any] = {}

    if q:
        conditions.append(
            """(
                a.action ILIKE :q
                OR a.target_type ILIKE :q
                OR a.target_id ILIKE :q
                OR pa.email ILIKE :q
                OR pa.name ILIKE :q
            )"""
        )
        params["q"] = f"%{q}%"

    if admin_id:
        conditions.append("a.admin_id = :admin_id")
        params["admin_id"] = UUID(admin_id)
    if action:
        conditions.append("a.action = :action")
        params["action"] = action
    if target_type:
        conditions.append("a.target_type = :target_type")
        params["target_type"] = target_type
    if target_id:
        conditions.append("a.target_id = :target_id")
        params["target_id"] = target_id
    if date_from:
        conditions.append("a.created_at >= :date_from")
        params["date_from"] = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
    if date_to:
        conditions.append("a.created_at <= :date_to")
        params["date_to"] = datetime.fromisoformat(date_to.replace("Z", "+00:00"))

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    return where, params


async def list_audit_logs(
    session: AsyncSession,
    *,
    q: str | None,
    admin_id: str | None,
    action: str | None,
    target_type: str | None,
    target_id: str | None,
    date_from: str | None,
    date_to: str | None,
    page: int,
    limit: int,
) -> dict[str, Any]:
    offset = (page - 1) * limit
    where, params = _build_where(
        q=q,
        admin_id=admin_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        date_from=date_from,
        date_to=date_to,
    )

    rows_result = await session.execute(
        text(
            f"""
            SELECT
                a.id,
                a.admin_id,
                pa.email AS admin_email,
                pa.name AS admin_name,
                a.action,
                a.target_type,
                a.target_id,
                a.metadata,
                a.ip_address,
                a.created_at
            FROM admin_audit_log a
            JOIN platform_admins pa ON pa.id = a.admin_id
            {where}
            ORDER BY a.created_at DESC
            LIMIT :limit OFFSET :offset
            """
        ),
        {**params, "limit": limit, "offset": offset},
    )
    rows = [_serialize_row(dict(r)) for r in rows_result.mappings().all()]

    count_result = await session.execute(
        text(
            f"""
            SELECT COUNT(*)
            FROM admin_audit_log a
            JOIN platform_admins pa ON pa.id = a.admin_id
            {where}
            """
        ),
        params,
    )
    total = count_result.scalar() or 0

    return {"items": rows, "total": total, "page": page, "limit": limit}


async def get_audit_log_by_id(
    session: AsyncSession,
    *,
    audit_id: str,
) -> dict[str, Any] | None:
    row_result = await session.execute(
        text(
            """
            SELECT
                a.id,
                a.admin_id,
                pa.email AS admin_email,
                pa.name AS admin_name,
                a.action,
                a.target_type,
                a.target_id,
                a.metadata,
                a.ip_address,
                a.created_at
            FROM admin_audit_log a
            JOIN platform_admins pa ON pa.id = a.admin_id
            WHERE a.id = :audit_id
            """
        ),
        {"audit_id": UUID(audit_id)},
    )
    row = row_result.mappings().first()
    if not row:
        return None
    return _serialize_row(dict(row))
