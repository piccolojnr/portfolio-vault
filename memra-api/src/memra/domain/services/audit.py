"""
Admin Audit Logger
===================

Writes to admin_audit_log for every sensitive platform admin action.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from memra.infrastructure.db.models.admin_audit_log import AdminAuditLog


async def log_action(
    session: AsyncSession,
    *,
    admin_id: str,
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> None:
    """Insert an audit log entry. Caller is responsible for committing."""
    row = AdminAuditLog(
        admin_id=uuid.UUID(admin_id),
        action=action,
        target_type=target_type,
        target_id=target_id,
        details=metadata or {},
        ip_address=ip_address,
    )
    session.add(row)
    await session.flush()
