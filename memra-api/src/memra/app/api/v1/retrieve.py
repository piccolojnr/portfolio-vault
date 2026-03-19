"""POST /api/v1/retrieve — return chunks only, no LLM call."""

from fastapi import APIRouter, Depends, HTTPException
from memra.app.core.config import Settings
from memra.app.core.dependencies import get_current_user, get_live_settings
from memra.domain.models.rag import QueryRequest, RetrieveResponse, RetrievedChunk
from memra.domain.services.lightrag_service import CORPUS_ID, retrieve_chunks

router = APIRouter(tags=["rag"])


@router.post("/retrieve", response_model=RetrieveResponse)
async def retrieve_endpoint(
    request: QueryRequest,
    settings: Settings = Depends(get_live_settings),
    current_user: dict = Depends(get_current_user),
):
    try:
        _ = current_user
        chunks = await retrieve_chunks(
            CORPUS_ID,
            request.question,
            settings,
            mode="hybrid",
        )

        if not chunks:
            raise HTTPException(status_code=404, detail="No relevant chunks found")

        return RetrieveResponse(
            question=request.question,
            retrieved_chunks=[
                RetrievedChunk(
                    content=c["content"],
                    source=c.get("file_path", "unknown"),
                    heading="",
                    similarity=0.0,
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
