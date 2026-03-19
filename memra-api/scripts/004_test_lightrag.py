"""
004 — LightRAG Integration Test
================================

Initialises a LightRAG instance using:
  - QdrantVectorDBStorage  for vectors   (cloud Qdrant from .env)
  - PGKVStorage            for documents (local Postgres from .env)
  - NetworkXStorage        for the graph (in-memory; PGGraphStorage needs AGE)

Scoped to workspace "test_vault_001" so it doesn't pollute production data.
Inserts four sample vault strings, runs two hybrid queries, and prints:
  - The LLM answer
  - Retrieved chunks
  - Graph entities (nodes)
  - Graph relationships (edges)

Run from rag/ directory:
    .venv\\Scripts\\python.exe scripts/004_test_lightrag.py

LLM:  uses the Anthropic model (or OpenAI fallback) from app config.
Embed: wraps core.embedding._embed_openai directly (no double-cost).
Concurrency: llm_model_max_async=2 to keep extraction costs low.
"""

import asyncio
import os
import re
import sys
from pathlib import Path

# ── make rag/ importable ──────────────────────────────────────────────────────
_RAG_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(_RAG_DIR))

from memra.app.core.config import get_settings  # noqa: E402

# ── constants ─────────────────────────────────────────────────────────────────
WORKSPACE = "test_vault_001"
WORKING_DIR = str(_RAG_DIR / "data" / "lightrag_test")


# ── helpers ───────────────────────────────────────────────────────────────────

def _parse_db_url(url: str) -> dict[str, str]:
    """Parse postgresql://user:pass@host:port/dbname into env-var dict."""
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


def _set_storage_env(settings) -> None:
    """Export env vars consumed by LightRAG Qdrant and PG storage backends."""
    if settings.qdrant_url:
        os.environ["QDRANT_URL"] = settings.qdrant_url
    if settings.qdrant_api_key:
        os.environ["QDRANT_API_KEY"] = settings.qdrant_api_key
    # QDRANT_WORKSPACE scopes all vector data to this test workspace
    os.environ["QDRANT_WORKSPACE"] = WORKSPACE

    if settings.database_url:
        pg = _parse_db_url(settings.database_url)
        for k, v in pg.items():
            os.environ[k] = v
        # Disable pgvector extension requirement — not installed on local Postgres
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


# ── Embedding function ────────────────────────────────────────────────────────

def _make_embedding_func(settings):
    """Wrap core.embedding into an async EmbeddingFunc for LightRAG.

    COMPAT lightrag-hku >=1.4.x
    EmbeddingFunc.__call__ (lightrag/utils.py) does:
        total_elements = result.size   # numpy ndarray attribute
    Our OpenAI helper returns list[list[float]], which has no .size.
    Wrap with np.array() before returning.
    Verify after upgrading: search lightrag/utils.py for 'result.size' —
    if that line is gone the np.array() wrapping is still harmless but no
    longer required.

    text-embedding-3-small → 1536-dim vectors.
    """
    import numpy as np
    from lightrag.utils import EmbeddingFunc

    async def _embed(texts: list[str]) -> "np.ndarray":
        if settings.use_demo:
            from memra.infrastructure.llm.embedding import _embed_demo
            # COMPAT: must be ndarray — EmbeddingFunc.__call__ calls result.size
            return np.array(_embed_demo(texts), dtype=np.float32)
        from memra.infrastructure.llm.embedding import _embed_openai
        vectors, _ = _embed_openai(texts, settings)
        # COMPAT: must be ndarray — EmbeddingFunc.__call__ calls result.size
        return np.array(vectors, dtype=np.float32)

    return EmbeddingFunc(
        embedding_dim=1536,   # text-embedding-3-small
        max_token_size=8191,
        func=_embed,
    )


# ── Sample vault content ──────────────────────────────────────────────────────

SAMPLE_DOCS = [
    """\
# Bio
Daud Rahim is a full-stack software engineer with 8+ years of experience
building distributed systems and data pipelines. He specialises in Python,
TypeScript, and cloud-native architectures on AWS and GCP.
""",
    """\
# Skills
Core languages: Python, TypeScript, Go.
Databases: PostgreSQL, Redis, Qdrant, MongoDB.
ML / AI: RAG pipelines, vector embeddings, LLM orchestration with LangChain
and LlamaIndex. Experience fine-tuning sentence-transformers.
""",
    """\
# Projects

## PortfolioVault
A personal knowledge-base RAG system that stores career data in PostgreSQL,
indexes it with Qdrant vector search, and answers questions using Claude or
GPT-4o. Processes 50+ markdown vault files, supports hybrid search, and
exposes a Next.js chat UI.

## PaymentsGateway
Led backend development of a PCI-DSS-compliant payment gateway processing
$12 million in monthly transactions for 200 merchants. Built with FastAPI,
Stripe integration, and real-time fraud detection.
""",
    """\
# Experience
2022–present: Senior Engineer at TechCorp — built internal ML platform
for A/B testing and feature flag management serving 3 million daily active users.

2019–2022: Software Engineer at FinStart — worked on IoT sensor data ingestion
pipeline handling 10 million events per day using Kafka and Apache Flink.
""",
]

QUERIES = [
    "What payment processing experience does Daud have?",
    "What databases and AI tools has Daud worked with?",
]


# ── main ──────────────────────────────────────────────────────────────────────

async def main() -> None:
    settings = get_settings()

    if settings.use_demo:
        print("[WARN] Running in demo mode — real LLM and embeddings will not be called.")

    _set_storage_env(settings)

    from lightrag import LightRAG, QueryParam

    Path(WORKING_DIR).mkdir(parents=True, exist_ok=True)

    llm_model_name = (
        settings.anthropic_model if settings.anthropic_api_key else settings.openai_model
    )

    print(f"Initialising LightRAG  workspace={WORKSPACE!r}  llm={llm_model_name}")
    rag = LightRAG(
        working_dir=WORKING_DIR,
        workspace=WORKSPACE,
        kv_storage="PGKVStorage",
        vector_storage="QdrantVectorDBStorage",
        graph_storage="NetworkXStorage", # use in-memory graph to avoid AGE/Postgres setup complexity
        llm_model_func=_make_llm_func(settings),
        llm_model_name=llm_model_name,
        llm_model_max_async=2,          # keep extraction costs low during testing
        embedding_func=_make_embedding_func(settings),
    )

    await rag.initialize_storages()

    # ── Insert ────────────────────────────────────────────────────────────────
    print(f"\nInserting {len(SAMPLE_DOCS)} sample documents …")
    await rag.ainsert(SAMPLE_DOCS)
    print("Insertion complete.")

    # ── Query ─────────────────────────────────────────────────────────────────
    for idx, query in enumerate(QUERIES, 1):
        sep = "=" * 64
        print(f"\n{sep}")
        print(f"Query {idx}: {query}")
        print(sep)

        # Full LLM answer
        answer = await rag.aquery(query, param=QueryParam(mode="hybrid"))
        print(f"\n[Answer]\n{answer}")

        # Structured retrieval (no extra LLM call)
        result = await rag.aquery_data(query, param=QueryParam(mode="hybrid"))

        if result.get("status") != "success":
            print(f"[Data retrieval failed] {result.get('message')}")
            continue

        data = result["data"]
        chunks = data.get("chunks", [])
        entities = data.get("entities", [])
        relations = data.get("relationships", [])

        print(f"\n[Retrieved Chunks] ({len(chunks)})")
        for c in chunks[:4]:
            snippet = c.get("content", "")[:150].replace("\n", " ")
            print(f"  • {snippet!r}")

        print(f"\n[Graph Entities / Nodes] ({len(entities)})")
        for e in entities[:8]:
            desc = e.get("description", "")[:90].replace("\n", " ")
            print(f"  • [{e.get('entity_type', '?')}] {e.get('entity_name', '?')}: {desc}")

        print(f"\n[Graph Relationships / Edges] ({len(relations)})")
        for r in relations[:6]:
            desc = r.get("description", "")[:90].replace("\n", " ")
            print(f"  • {r.get('src_id', '?')} → {r.get('tgt_id', '?')}: {desc}")

    await rag.finalize_storages()
    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())
