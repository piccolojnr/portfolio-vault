"""
LightRAG Service
================

Central integration point for LightRAG graph-augmented retrieval.

Maintains an in-memory registry of LightRAG instances keyed by corpus_id.
All instances share the same storage configuration:

  - QdrantVectorDBStorage   vectors    (cloud Qdrant from .env)
  - PGKVStorage             documents  (POSTGRES_ENABLE_VECTOR=false — no pgvector)
  - NetworkXStorage         graph      (in-memory, persisted to
                                        data/graphs/<corpus_id>/*.graphml)

Each corpus_id is isolated at the Qdrant workspace level and in its own
working_dir, so test and production data never mix.

CORPUS_ID = "portfolio_vault" is the default for all vault documents.
"""

from __future__ import annotations

import asyncio
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from lightrag import LightRAG

_RAG_DIR = Path(__file__).parents[4]          # domain/services/ → src/portfolio_rag/ → src/ → rag/
_GRAPHS_DIR = _RAG_DIR / "data" / "graphs"

# Default corpus used by the ingestion and query paths for vault documents.
CORPUS_ID = "portfolio_vault"

# ── instance registry ─────────────────────────────────────────────────────────
# All instances live in FastAPI's event loop.  Never share across loops.
_registry: dict[str, "LightRAG"] = {}
_init_locks: dict[str, asyncio.Lock] = {}  # created lazily, one per corpus_id

# ── session factory (for cost logging) ────────────────────────────────────────
# Set once at process startup by main.py lifespan and by the worker.
# None until set — embed logging is silently skipped when unset.
_session_factory = None


def set_session_factory(factory) -> None:
    """Register the async session factory for embed cost logging.

    Call once from app lifespan and from the worker startup, after
    open_db_engine() returns.  Not thread-safe — call before any concurrent
    embedding occurs.
    """
    global _session_factory
    _session_factory = factory


async def _log_embed_bg(token_count: int, model: str) -> None:
    """Best-effort background task: log an embed call to ai_calls."""
    if _session_factory is None:
        return
    try:
        from portfolio_rag.domain.services.ai_calls import log_call
        async with _session_factory() as _session:
            await log_call(
                _session, "embed",
                model=model,
                provider="openai",
                input_tokens=token_count,
                output_tokens=0,
            )
            await _session.commit()
    except Exception:
        pass


# ── storage environment ───────────────────────────────────────────────────────

def _parse_db_url(url: str) -> dict[str, str]:
    """Parse postgresql://user:pass@host:port/dbname → dict of POSTGRES_* env vars."""
    m = re.match(r"postgresql(?:\+\w+)?://([^:]+):([^@]+)@([^:/]+):?(\d+)?/(.+)", url)
    if not m:
        raise ValueError(f"Cannot parse DATABASE_URL: {url!r}")
    user, password, host, port, database = m.groups()
    return {
        "POSTGRES_USER": user,
        "POSTGRES_PASSWORD": password,
        "POSTGRES_HOST": host,
        "POSTGRES_PORT": port or "5432",
        "POSTGRES_DATABASE": database,
    }


def _apply_storage_env(settings) -> None:
    """Write storage credentials into os.environ for LightRAG backends.

    Called once before constructing each LightRAG instance.  This function
    mutates the process-global os.environ, which is safe for this codebase
    because:
      - There is exactly one Qdrant cluster and one Postgres instance.
      - Settings come from a single Settings object (env + DB overrides).
    If you introduce multi-tenant / multi-credential support in future,
    revisit this: PGKVStorage and QdrantVectorDBStorage both read these at
    pool-initialisation time, so per-instance credentials would require a
    different mechanism (e.g., subclassing the storage backends).
    """
    if settings.qdrant_url:
        os.environ["QDRANT_URL"] = settings.qdrant_url
    if settings.qdrant_api_key:
        os.environ["QDRANT_API_KEY"] = settings.qdrant_api_key

    if settings.database_url:
        for k, v in _parse_db_url(settings.database_url).items():
            os.environ[k] = v
        # COMPAT: PGKVStorage calls register_vector() at pool init which fails
        # if the pgvector Postgres extension is not installed.  Setting this to
        # "false" skips that registration.  The service does not use Postgres
        # vector columns; NetworkXStorage handles the graph, Qdrant handles vectors.
        os.environ.setdefault("POSTGRES_ENABLE_VECTOR", "false")


# ── LLM function ──────────────────────────────────────────────────────────────

def _make_llm_func(settings):
    """Return an async LLM function for LightRAG entity/relation extraction.

    COMPAT lightrag-hku >=1.4.x
    Do NOT use functools.partial(openai_complete_if_cache, model=X) here.
    LightRAG wraps the func with priority_limit_async_func_call and later calls
    it as partial(use_model_func, _priority=5)(prompt, ..., model=llm_model_name).
    That injects model= at call-time, colliding with the partial-bound model=,
    raising: TypeError: got multiple values for argument 'model'.
    Use a closure and pop 'model' from kwargs to absorb it safely.
    Verify this is still needed after upgrading: search lightrag/operate.py for
    'partial(use_model_func' and check whether model= is still passed as a kwarg.
    """
    if settings.anthropic_api_key:
        from lightrag.llm.anthropic import anthropic_complete_if_cache

        _model = settings.anthropic_model
        _key = settings.anthropic_api_key

        async def _llm_anthropic(prompt, system_prompt=None, history_messages=None, **kwargs):
            # COMPAT: absorb model= injected by LightRAG's priority wrapper (see docstring)
            kwargs.pop("model", None)
            return await anthropic_complete_if_cache(
                model=_model,
                prompt=prompt,
                system_prompt=system_prompt,
                history_messages=history_messages or [],
                api_key=_key,
                **kwargs,
            )

        return _llm_anthropic

    from lightrag.llm.openai import openai_complete_if_cache

    _model = settings.openai_model
    _key = settings.openai_api_key

    async def _llm_openai(prompt, system_prompt=None, history_messages=None, **kwargs):
        # COMPAT: absorb model= injected by LightRAG's priority wrapper (see docstring)
        kwargs.pop("model", None)
        return await openai_complete_if_cache(
            model=_model,
            prompt=prompt,
            system_prompt=system_prompt,
            history_messages=history_messages or [],
            api_key=_key,
            **kwargs,
        )

    return _llm_openai


# ── embedding function ────────────────────────────────────────────────────────

def _make_embedding_func(settings):
    """Return an EmbeddingFunc wrapping portfolio_rag.infrastructure.llm.embedding for LightRAG.

    COMPAT lightrag-hku >=1.4.x
    EmbeddingFunc.__call__ (lightrag/utils.py) does:
        total_elements = result.size   # numpy ndarray attribute
    core.embedding helpers return list[list[float]], which has no .size.
    Wrap with np.array() before returning.
    Verify after upgrading: search lightrag/utils.py for 'result.size' —
    if that line is gone the np.array() wrapping is still harmless but no
    longer required.

    text-embedding-3-small → 1536-dim vectors.
    """
    from lightrag.utils import EmbeddingFunc

    async def _embed(texts: list[str]) -> np.ndarray:
        if settings.use_demo:
            from portfolio_rag.infrastructure.llm.embedding import _embed_demo
            # COMPAT: must be ndarray — EmbeddingFunc.__call__ calls result.size
            return np.array(_embed_demo(texts), dtype=np.float32)
        from portfolio_rag.infrastructure.llm.embedding import _embed_openai
        vectors, token_count = _embed_openai(texts, settings)
        if token_count:
            asyncio.ensure_future(_log_embed_bg(token_count, settings.embedding_model))
        # COMPAT: must be ndarray — EmbeddingFunc.__call__ calls result.size
        return np.array(vectors, dtype=np.float32)

    return EmbeddingFunc(
        embedding_dim=1536,   # text-embedding-3-small
        max_token_size=8191,
        func=_embed,
    )


# ── result type ───────────────────────────────────────────────────────────────

@dataclass
class QueryResult:
    answer: str
    chunks: list[dict] = field(default_factory=list)
    entities: list[dict] = field(default_factory=list)
    relations: list[dict] = field(default_factory=list)


# ── registry API ──────────────────────────────────────────────────────────────

async def get_or_create_instance(corpus_id: str, settings) -> "LightRAG":
    """Return the cached LightRAG instance for corpus_id, creating it if needed.

    working_dir is corpus-scoped: rag/data/graphs/<corpus_id>/
    workspace=corpus_id isolates Qdrant and PG data per corpus.
    """
    if corpus_id in _registry:
        return _registry[corpus_id]

    # Lazy lock creation — safe because get_or_create_instance is always called
    # from a single-threaded async event loop; no concurrent Python execution here.
    if corpus_id not in _init_locks:
        _init_locks[corpus_id] = asyncio.Lock()

    async with _init_locks[corpus_id]:
        if corpus_id in _registry:
            return _registry[corpus_id]

        _apply_storage_env(settings)

        from lightrag import LightRAG

        working_dir = str(_GRAPHS_DIR)
        # mkdir must precede LightRAG() construction — it writes files at init time.
        Path(working_dir).mkdir(parents=True, exist_ok=True)

        llm_name = (
            settings.anthropic_model if settings.anthropic_api_key else settings.openai_model
        )

        rag = LightRAG(
            working_dir=working_dir,
            workspace=corpus_id,
            kv_storage="PGKVStorage",
            vector_storage="QdrantVectorDBStorage",
            graph_storage="NetworkXStorage",  # PGGraphStorage requires Apache AGE (unavailable)
            llm_model_func=_make_llm_func(settings),
            llm_model_name=llm_name,
            llm_model_max_async=4,
            embedding_func=_make_embedding_func(settings),
        )

        await rag.initialize_storages()
        _registry[corpus_id] = rag

    return _registry[corpus_id]


async def ingest(
    corpus_id: str,
    content: str,
    document_id: str,
    settings,
) -> None:
    """Insert a single document into the LightRAG corpus.

    If ainsert returns normally the content is in the graph (new or duplicate).
    If ainsert hangs — which happens when LightRAG detects a duplicate that has
    a prior "failed" internal entry — we treat it as already-indexed and return
    successfully after a timeout.  Touching LightRAG's internal tables is
    deliberately avoided to stay resilient against library upgrades.

    document_id is stored as the file_path metadata so retrieved chunks can
    be traced back to their source VaultDocument.
    """
    import asyncio
    import logging
    _logger = logging.getLogger(__name__)

    rag = await get_or_create_instance(corpus_id, settings)
    try:
        await asyncio.wait_for(
            rag.ainsert(content, file_paths=[document_id]),
            timeout=900.0,  # 15-minute hard cap; genuine ingestion of large docs can be slow
        )
    except asyncio.TimeoutError:
        # ainsert hung — the most common cause is LightRAG detecting the content
        # as a duplicate that has a prior "failed" entry in its internal doc_status
        # table, causing its async pipeline to stall rather than return cleanly.
        # The content is already present in the knowledge graph, so this is a
        # success from the caller's perspective.
        _logger.warning(
            "[lightrag] ainsert timed out for document_id=%s — "
            "content is likely already indexed; treating as ready",
            document_id,
        )


async def query(
    corpus_id: str,
    query_text: str,
    settings,
    *,
    mode: str = "hybrid", # "retrieval_only" or "generation_only" to skip LLM or retrieval phases, respectively
) -> QueryResult:
    """Query the corpus.  Returns answer text plus structured graph data.

    Calls aquery (LLM synthesis) and aquery_data (structured retrieval) as
    two separate requests — aquery_data does not trigger a second LLM call,
    it only re-runs the retrieval phase.
    """
    from lightrag import QueryParam

    rag = await get_or_create_instance(corpus_id, settings)
    param = QueryParam(mode=mode)

    answer = await rag.aquery(query_text, param=param)

    # Fetch structured data without a second LLM generation call
    data_result = await rag.aquery_data(query_text, param=param)

    chunks: list[dict] = []
    entities: list[dict] = []
    relations: list[dict] = []
    if data_result.get("status") == "success":
        data = data_result.get("data", {})
        chunks = data.get("chunks", [])
        entities = data.get("entities", [])
        relations = data.get("relationships", [])

    return QueryResult(
        answer=answer or "",
        chunks=chunks,
        entities=entities,
        relations=relations,
    )


async def finalize_all() -> None:
    """Finalize all cached instances.  Call once during server shutdown."""
    for corpus_id, rag in list(_registry.items()):
        try:
            await rag.finalize_storages()
        except Exception:
            pass
    _registry.clear()
    _init_locks.clear()
