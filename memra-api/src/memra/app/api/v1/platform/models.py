"""
Model Configuration Router
============================

GET  /models              → all models with plan restrictions
PUT  /models/{model_id}   → update restriction
POST /models              → add model
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from memra.app.core.db import get_db_conn
from memra.app.core.platform_auth import get_platform_admin
from memra.domain.services import audit
from memra.infrastructure.db.models.model_plan_restriction import ModelPlanRestriction

router = APIRouter(prefix="/models", tags=["platform-admin-models"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]
Admin = Annotated[dict, Depends(get_platform_admin)]


class UpdateModelRequest(BaseModel):
    enabled: bool | None = None
    min_plan: str | None = None


class CreateModelRequest(BaseModel):
    model_id: str
    model_name: str
    model_type: str
    provider: str
    min_plan: str = "free"


@router.get("")
async def list_models(session: DBSession, admin: Admin):
    rows = (
        await session.execute(select(ModelPlanRestriction).order_by(ModelPlanRestriction.provider))
    ).scalars().all()
    return [
        {
            "model_id": r.model_id,
            "model_name": r.model_name,
            "model_type": r.model_type,
            "provider": r.provider,
            "min_plan": r.min_plan,
            "enabled": r.enabled,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.put("/{model_id}")
async def update_model(
    model_id: str,
    body: UpdateModelRequest,
    request: Request,
    session: DBSession,
    admin: Admin,
):
    row = await session.get(ModelPlanRestriction, model_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Model not found")

    if body.enabled is not None:
        row.enabled = body.enabled
    if body.min_plan is not None:
        if body.min_plan not in ("free", "pro", "enterprise"):
            raise HTTPException(status_code=400, detail="Invalid plan tier")
        row.min_plan = body.min_plan

    session.add(row)

    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    await audit.log_action(
        session,
        admin_id=admin["sub"],
        action="model_config_update",
        target_type="model",
        target_id=model_id,
        metadata=body.model_dump(exclude_none=True),
        ip_address=ip,
    )
    await session.commit()
    return {"status": "updated"}


@router.post("", status_code=201)
async def create_model(
    body: CreateModelRequest,
    request: Request,
    session: DBSession,
    admin: Admin,
):
    existing = await session.get(ModelPlanRestriction, body.model_id)
    if existing:
        raise HTTPException(status_code=409, detail="Model already exists")

    row = ModelPlanRestriction(
        model_id=body.model_id,
        model_name=body.model_name,
        model_type=body.model_type,
        provider=body.provider,
        min_plan=body.min_plan,
    )
    session.add(row)

    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    await audit.log_action(
        session,
        admin_id=admin["sub"],
        action="model_create",
        target_type="model",
        target_id=body.model_id,
        ip_address=ip,
    )
    await session.commit()
    return {"model_id": body.model_id}
