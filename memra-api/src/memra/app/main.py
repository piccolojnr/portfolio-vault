"""
Memra API
=========

Application factory + lifespan + uvicorn entrypoint.

Run:
  cd rag
  uvicorn memra.app.main:app --reload
"""

from contextlib import asynccontextmanager
import logging

import uvicorn
from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from memra.app.api.v1 import (
    health, retrieve, query,
    documents, storage,
    settings, conversations, export, chat, graph, admin, auth, orgs,
    webhooks,
    billing,
)
from memra.app.api.v1.platform import router as platform_router
from memra.app.core.config import get_settings
from memra.app.core.db import open_db_engine
from memra.app.core.limiter import limiter
from memra.app.core.billing import PaywallError, paywall_error_handler


def _configure_memra_logging(log_level: str) -> None:
    """Apply LOG_LEVEL to app loggers. Uvicorn defaults to INFO, which hides logger.debug()."""
    level = getattr(logging, log_level.upper(), logging.INFO)
    logging.getLogger("memra").setLevel(level)


def _print_startup_banner(db_connected: bool = False, neo4j_connected: bool = False) -> None:
    settings = get_settings()
    print("=" * 60)
    print("Memra API  v1.0.0")
    print("=" * 60)
    print(f"  Environment:    {settings.environment}")
    print(f"  Demo mode:      {settings.use_demo}")
    print(f"  OpenAI key:     {'yes' if settings.openai_api_key else 'no'}")
    print(f"  Anthropic key:  {'yes' if settings.anthropic_api_key else 'no'}")
    print(f"  Qdrant URL:     {'yes' if settings.qdrant_url else 'no'}")
    print(f"  Database:       {'connected' if db_connected else 'not configured'}")
    print(f"  Neo4j:          {'connected' if neo4j_connected else 'not configured'}")
    print(f"  Storage:        {settings.storage_provider}")
    print(f"  Log level:      {settings.log_level}")
    print("=" * 60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    _configure_memra_logging(settings.log_level)

    # ── Database ──
    if settings.database_url:
        engine, factory = await open_db_engine(settings.database_url)
        app.state.db_engine = engine
        app.state.db_session_factory = factory
        from memra.domain.services.lightrag_service import set_session_factory as _lr_set_sf
        _lr_set_sf(factory)
    else:
        app.state.db_engine = None
        app.state.db_session_factory = None

    # ── Neo4j ──
    neo4j_connected = False
    app.state.neo4j_driver = None
    if settings.neo4j_uri:
        from memra.infrastructure.neo4j import open_neo4j_driver
        driver = await open_neo4j_driver(settings)
        app.state.neo4j_driver = driver
        neo4j_connected = driver is not None

    _print_startup_banner(
        db_connected=bool(settings.database_url),
        neo4j_connected=neo4j_connected,
    )

    yield

    # ── Shutdown ──
    if app.state.db_engine:
        await app.state.db_engine.dispose()

    if app.state.neo4j_driver:
        from memra.infrastructure.neo4j import close_neo4j_driver
        await close_neo4j_driver(app.state.neo4j_driver)

    from memra.domain.services.lightrag_service import finalize_all as _lr_finalize
    await _lr_finalize()


def create_app() -> FastAPI:
    _settings = get_settings()

    app = FastAPI(
        title="Memra API",
        description="Memra — AI-powered knowledge API",
        version="1.0.0",
        lifespan=lifespan,
    )

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_exception_handler(PaywallError, paywall_error_handler)
    app.add_middleware(SlowAPIMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    v1 = APIRouter(prefix="/api/v1")
    v1.include_router(health.router)
    v1.include_router(retrieve.router)
    v1.include_router(query.router)
    v1.include_router(documents.router)
    v1.include_router(storage.router)
    v1.include_router(settings.router)
    v1.include_router(conversations.router)
    v1.include_router(export.router)
    v1.include_router(chat.router)
    v1.include_router(graph.router)
    v1.include_router(admin.router)
    v1.include_router(auth.router)
    v1.include_router(orgs.router)
    v1.include_router(platform_router)
    v1.include_router(webhooks.router)
    v1.include_router(billing.router)
    app.include_router(v1)

    @app.get("/")
    async def root():
        return {
            "name": "Memra API",
            "description": "Memra — AI-powered knowledge API",
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
    uvicorn.run("memra.app.main:app", reload=True, host="0.0.0.0", port=8000)
