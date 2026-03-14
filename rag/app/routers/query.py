"""POST /api/v1/query — retrieve chunks + generate LLM answer + log cost."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.db import get_db_conn
from app.dependencies import get_live_settings
from app.models import QueryLog
from app.schemas.rag import QueryRequest, QueryResponse, RetrievedChunk
from core import retrieve_and_answer

router = APIRouter(tags=["rag"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]


@router.post("/query", response_model=QueryResponse)
async def query_endpoint(
    request: QueryRequest,
    session: DBSession,
    settings: Settings = Depends(get_live_settings),
):
    try:
        answer, chunks, usage = retrieve_and_answer(
            request.question, settings=settings, n_results=request.n_results
        )

        if not chunks:
            raise HTTPException(status_code=404, detail="No relevant chunks found")

        # Log cost to query_logs (best-effort — never fail the response)
        if usage:
            try:
                log = QueryLog(
                    question=request.question,
                    model=usage.get("model"),
                    provider=usage.get("provider"),
                    input_tokens=usage.get("input_tokens"),
                    output_tokens=usage.get("output_tokens"),
                    total_tokens=usage.get("total_tokens"),
                    cost_usd=usage.get("cost_usd"),
                )
                session.add(log)
                await session.commit()
            except Exception:
                pass

        return QueryResponse(
            question=request.question,
            retrieved_chunks=[
                RetrievedChunk(
                    content=c["content"],
                    source=c["source"],
                    heading=c["heading"],
                    similarity=c["similarity"],
                )
                for c in chunks
            ],
            answer=answer,
            mode="demo" if settings.use_demo else "real",
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
