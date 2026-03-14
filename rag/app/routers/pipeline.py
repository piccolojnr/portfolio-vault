"""
Pipeline Control Router
========================

Endpoints for running the chunk/embed pipeline with SSE progress streaming
and viewing run history. Business logic lives in app.services.pipeline.

Prefix: /pipeline (mounted under /api/v1)
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_db_conn
from app.schemas.pipeline import CostEstimate, PipelineRunList, PipelineRunSummary
from app.services import pipeline as svc

router = APIRouter(prefix="/pipeline", tags=["pipeline"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]


@router.get("/runs", response_model=PipelineRunList)
async def list_runs(
    session: DBSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    return await svc.list_runs(session, page, page_size)


@router.get("/runs/{run_id}", response_model=PipelineRunSummary)
async def get_run(run_id: str, session: DBSession):
    try:
        run = await svc.get_run(session, run_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return svc.summarise(run)


@router.get("/cost-estimate", response_model=CostEstimate)
async def cost_estimate():
    return svc.compute_cost_estimate(get_settings())


@router.post("/run")
async def run_pipeline():
    """Start the full pipeline and stream SSE progress events."""
    return StreamingResponse(
        svc.pipeline_event_stream(get_settings()),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
