"""
Portfolio Vault RAG API
========================

Application factory + lifespan + uvicorn entrypoint.

Run:
  cd rag
  .venv/Scripts/uvicorn.exe app.main:app --reload
  # or
  .venv/Scripts/python.exe -m app.main
"""

from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware

from app.routers import health, retrieve, query
from app.config import get_settings


def _print_startup_banner() -> None:
    settings = get_settings()
    print("=" * 60)
    print("Portfolio Vault RAG API  v1.0.0")
    print("=" * 60)
    print(f"  Demo mode:      {settings.use_demo}")
    print(f"  OpenAI key:     {'yes' if settings.openai_api_key else 'no'}")
    print(f"  Anthropic key:  {'yes' if settings.anthropic_api_key else 'no'}")
    print(f"  Qdrant URL:     {'yes' if settings.qdrant_url else 'no'}")
    print("=" * 60)
    print("  Docs:     http://localhost:8000/docs")
    print("  Health:   GET  http://localhost:8000/api/v1/health")
    print("  Retrieve: POST http://localhost:8000/api/v1/retrieve")
    print("  Query:    POST http://localhost:8000/api/v1/query")
    print("=" * 60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _print_startup_banner()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Portfolio Vault RAG API",
        description="Ask questions about Daud Rahim's experience, skills, and projects",
        version="1.0.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    v1 = APIRouter(prefix="/api/v1")
    v1.include_router(health.router)
    v1.include_router(retrieve.router)
    v1.include_router(query.router)
    app.include_router(v1)

    @app.get("/")
    async def root():
        return {
            "name": "Portfolio Vault RAG API",
            "description": "Ask questions about Daud Rahim's experience, skills, and projects",
            "endpoints": {
                "health": "GET /api/v1/health",
                "retrieve": "POST /api/v1/retrieve (chunks only, no LLM)",
                "query": "POST /api/v1/query (chunks + LLM answer)",
                "docs": "GET /docs (interactive Swagger UI)",
            },
        }

    return app


app = create_app()

if __name__ == "__main__":
    uvicorn.run("app.main:app", reload=True, host="0.0.0.0", port=8000)
