"""
STAGE 1D: REST API Server (using package imports)
==================================================

FastAPI server exposing the RAG pipeline as HTTP endpoints.

Run:
  cd rag
  .\.venv\Scripts\python.exe scripts/04_server.py

Access:
  POST http://localhost:8000/query
  GET http://localhost:8000/docs  (interactive Swagger UI)
  GET http://localhost:8000/health
"""

import sys
from pathlib import Path

# Add parent directory to path so portfolio_vault can be imported
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from portfolio_vault import retrieve_and_answer, USE_DEMO, print_config
from portfolio_vault.retrieval import retrieve as _retrieve
from portfolio_vault.database import get_collection


# Pydantic models
class QueryRequest(BaseModel):
    question: str
    n_results: int = 5


class RetrievedChunk(BaseModel):
    content: str
    source: str
    heading: str
    similarity: float


class RetrieveResponse(BaseModel):
    question: str
    retrieved_chunks: list[RetrievedChunk]
    mode: str


class QueryResponse(BaseModel):
    question: str
    retrieved_chunks: list[RetrievedChunk]
    answer: str
    mode: str


# Create FastAPI app
app = FastAPI(
    title="Portfolio Vault RAG API",
    description="Ask questions about Daud Rahim's experience, skills, and projects",
    version="1.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Routes
@app.get("/")
async def root():
    """Welcome endpoint."""
    return {
        "name": "Portfolio Vault RAG API",
        "description": "Ask questions about Daud Rahim's experience, skills, and projects",
        "endpoints": {
            "health": "GET /health",
            "retrieve": "POST /retrieve (chunks only, no LLM)",
            "query": "POST /query (chunks + LLM answer)",
            "docs": "GET /docs (interactive Swagger UI)",
        },
        "example_questions": [
            "Which of Daud's projects involved payment processing?",
            "What IoT or hardware work has Daud done?",
            "How many users has Daud's work reached?",
            "What is Daud's strongest technical skill?",
        ],
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    try:
        collection = get_collection()
        return {
            "status": "ok",
            "chunks_loaded": collection.count(),
            "demo_mode": USE_DEMO,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/retrieve", response_model=RetrieveResponse)
async def retrieve_endpoint(request: QueryRequest):
    """Retrieve relevant chunks without generating an LLM answer."""
    try:
        chunks = _retrieve(request.question, n=request.n_results)

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
            mode="demo" if USE_DEMO else "real",
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in /retrieve: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/query", response_model=QueryResponse)
async def query_endpoint(request: QueryRequest):
    """Ask a question about Daud's experience."""
    try:
        answer, chunks = retrieve_and_answer(request.question, n_results=request.n_results)
        
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
            mode="demo" if USE_DEMO else "real",
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    
    print_config()
    print("\n" + "=" * 60)
    print("Starting Portfolio Vault RAG API Server")
    print("=" * 60)
    print("📚 Interactive docs: http://localhost:8000/docs")
    print("💬 Query endpoint:   POST http://localhost:8000/query")
    print("=" * 60 + "\n")
    
    uvicorn.run(app, host="0.0.0.0", port=8000)
