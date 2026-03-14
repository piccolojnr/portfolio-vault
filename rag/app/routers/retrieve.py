"""POST /api/v1/retrieve — return chunks only, no LLM call."""

from fastapi import APIRouter, Depends, HTTPException
from app.config import Settings, get_settings
from app.schemas.rag import QueryRequest, RetrieveResponse, RetrievedChunk
from core.retrieval import retrieve

router = APIRouter(tags=["rag"])


@router.post("/retrieve", response_model=RetrieveResponse)
async def retrieve_endpoint(
    request: QueryRequest,
    settings: Settings = Depends(get_settings),
):
    try:
        chunks = retrieve(request.question, settings=settings, n=request.n_results)

        if not chunks:
            raise HTTPException(status_code=404, detail="No relevant chunks found")

        return RetrieveResponse(
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
            mode="demo" if settings.use_demo else "real",
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in /retrieve: {e}")
        raise HTTPException(status_code=500, detail=str(e))
