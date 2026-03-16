"""POST /api/v1/query — retrieve chunks + generate LLM answer + log cost.

Routing:
  settings.use_legacy_retrieval = True  (default during transition)
      → Qdrant vector search + LLM generation
  settings.use_legacy_retrieval = False
      → LightRAG hybrid graph+vector query

Switch via the settings table for a live, zero-downtime cutover.
Business logic lives in app.services.query.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.db import get_db_conn
from app.dependencies import get_live_settings
from app.schemas.rag import QueryRequest, QueryResponse
from app.services import query as svc

router = APIRouter(tags=["rag"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]


@router.post("/query", response_model=QueryResponse)
async def query_endpoint(
    request: QueryRequest,
    session: DBSession,
    settings: Settings = Depends(get_live_settings),
):
    try:
        response, log = await svc.run_query(request.question, request.n_results, settings)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Persist cost log best-effort — never fail the response over a logging error
    if log is not None:
        try:
            session.add(log)
            await session.commit()
        except Exception:
            pass

    return response
