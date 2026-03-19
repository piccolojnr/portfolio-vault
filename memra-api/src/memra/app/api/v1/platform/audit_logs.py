"""
Platform Admin Audit Logs Router
=================================

GET /audit-logs             -> paginated, filtered audit logs
GET /audit-logs/{audit_id}  -> audit log detail
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from memra.app.core.db import get_db_conn
from memra.app.core.platform_auth import get_platform_admin
from memra.domain.services.admin_audit_service import (
    get_audit_log_by_id,
    list_audit_logs,
)

router = APIRouter(prefix="/audit-logs", tags=["platform-admin-audit-logs"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]
Admin = Annotated[dict, Depends(get_platform_admin)]


class AuditLogItem(BaseModel):
    id: str
    admin_id: str
    admin_email: str
    admin_name: str
    action: str
    target_type: str | None = None
    target_id: str | None = None
    metadata: dict[str, Any]
    ip_address: str | None = None
    created_at: str


class AuditLogListResponse(BaseModel):
    items: list[AuditLogItem]
    total: int
    page: int
    limit: int


class AuditLogDetailResponse(BaseModel):
    item: AuditLogItem


@router.get("", response_model=AuditLogListResponse)
async def audit_logs(
    session: DBSession,
    _admin: Admin,
    q: str | None = Query(None),
    admin_id: str | None = Query(None),
    action: str | None = Query(None),
    target_type: str | None = Query(None),
    target_id: str | None = Query(None),
    date_from: str | None = Query(None, alias="from"),
    date_to: str | None = Query(None, alias="to"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    return await list_audit_logs(
        session,
        q=q,
        admin_id=admin_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        date_from=date_from,
        date_to=date_to,
        page=page,
        limit=limit,
    )


@router.get("/{audit_id}", response_model=AuditLogDetailResponse)
async def audit_log_detail(
    audit_id: str,
    session: DBSession,
    _admin: Admin,
):
    item = await get_audit_log_by_id(session, audit_id=audit_id)
    if not item:
        raise HTTPException(status_code=404, detail="Audit log not found")
    return {"item": item}
