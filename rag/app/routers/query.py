"""POST /api/v1/query — retrieve chunks + generate LLM answer."""

from fastapi import APIRouter, Depends, HTTPException
from app.config import Settings, get_settings
from app.schemas.rag import QueryRequest, QueryResponse, RetrievedChunk
from core import retrieve_and_answer

router = APIRouter(tags=["rag"])


@router.post("/query", response_model=QueryResponse)
async def query_endpoint(
    request: QueryRequest,
    settings: Settings = Depends(get_settings),
):
    try:
        answer, chunks = retrieve_and_answer(
            request.question, settings=settings, n_results=request.n_results
        )

        if not chunks:
            raise HTTPException(status_code=404, detail="No relevant chunks found")

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
