"""POST /api/v1/query — LightRAG hybrid query + cost logging.

Business logic lives in memra.domain.services.query.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from memra.app.core.config import Settings
from memra.app.core.db import get_db_conn
from memra.app.core.dependencies import get_current_user, get_live_settings
from memra.domain.models.rag import QueryRequest, QueryResponse
from memra.domain.services import query as svc
from memra.domain.services.ai_calls import log_call

router = APIRouter(tags=["rag"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]


@router.post("/query", response_model=QueryResponse)
async def query_endpoint(
    request: QueryRequest,
    session: DBSession,
    settings: Settings = Depends(get_live_settings),
    current_user: dict = Depends(get_current_user),
):
    try:
        response, usage = await svc.run_query(request.question, request.n_results, settings)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Log AI call best-effort — never fail the response over a logging error
    if usage:
        try:
            from uuid import UUID as _UUID
            await log_call(
                session, "query",
                model=usage.get("model", ""),
                provider=usage.get("provider", ""),
                input_tokens=usage.get("input_tokens"),
                output_tokens=usage.get("output_tokens"),
                cost_usd=usage.get("cost_usd"),
                org_id=_UUID(current_user["org_id"]) if current_user.get("org_id") else None,
            )
            await session.commit()
        except Exception:
            pass

    return response
