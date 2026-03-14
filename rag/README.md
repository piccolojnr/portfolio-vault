# Portfolio Vault RAG — Python Server

FastAPI backend that turns markdown vault documents into a searchable, conversational knowledge base using vector embeddings and an LLM.

## Stack

| Layer | Technology |
|---|---|
| API | FastAPI + uvicorn |
| Vector DB | Qdrant (local file or cloud) |
| Relational DB | PostgreSQL via SQLModel + asyncpg |
| Embeddings | OpenAI `text-embedding-3-small` / `text-embedding-3-large` |
| Generation | Anthropic Claude or OpenAI GPT (configurable) |
| Encryption | Fernet symmetric encryption (`cryptography`) |

## Project Structure

```
rag/
├── app/
│   ├── main.py              # App factory, lifespan, CORS, router wiring
│   ├── config.py            # Settings (pydantic-settings, cached)
│   ├── db.py                # Async SQLModel engine + get_db_conn() dependency
│   ├── dependencies.py      # Shared FastAPI Depends() helpers
│   ├── models/              # SQLModel table definitions
│   │   ├── vault.py         # VaultDocument
│   │   ├── pipeline.py      # PipelineRun
│   │   ├── settings.py      # AppSetting
│   │   └── query.py         # QueryLog
│   ├── schemas/             # Pydantic request/response schemas
│   │   ├── rag.py           # QueryRequest, RetrieveResponse, QueryResponse
│   │   ├── vault.py         # VaultDoc*, ReindexResponse, ReindexStatus
│   │   ├── pipeline.py      # PipelineRunSummary, CostEstimate
│   │   └── settings.py      # SettingsRead, SettingsUpdate
│   ├── routers/             # Thin HTTP handlers — call services, map errors to HTTP
│   │   ├── health.py
│   │   ├── retrieve.py
│   │   ├── query.py
│   │   ├── vault.py
│   │   ├── pipeline.py
│   │   └── settings.py
│   └── services/            # Business logic
│       ├── vault.py         # Vault document CRUD
│       ├── pipeline.py      # Run listing, cost estimate, SSE event stream
│       ├── settings.py      # Effective settings merge (env + DB), key masking
│       ├── settings_db.py   # Raw DB layer for AppSetting table
│       └── crypto.py        # Fernet encrypt/decrypt for API keys
├── core/                    # Pure logic — no FastAPI, no HTTP
│   ├── __init__.py          # retrieve_and_answer() convenience wrapper
│   ├── chunking.py          # split_by_headings(), chunk_document()
│   ├── costs.py             # Price tables, embedding_cost(), generation_cost()
│   ├── database.py          # get_qdrant_client(), get_collection()
│   ├── embedding.py         # embed() → (vectors, token_count)
│   ├── generation.py        # generate() → (answer, usage_dict)
│   ├── indexer.py           # index_all_docs() — full pipeline callable
│   ├── retrieval.py         # retrieve() — semantic search
│   └── vault_db.py          # Sync helpers: get_docs(), pipeline run helpers
├── migrations/
│   ├── 001_init.sql         # vault_documents, pipeline_runs, settings tables
│   └── 002_query_logs.sql   # query_logs table
├── scripts/                 # One-off CLI scripts (run in order for first setup)
│   ├── 00_migrate_db.py     # Apply DDL + SQLModel.metadata.create_all()
│   ├── 00_seed_db.py        # Upsert .md files from vault into vault_documents
│   ├── 01_chunk.py          # Preview chunks from DB (dry-run, no Qdrant write)
│   ├── 02_embed_and_store.py # Full index: embed + upsert to Qdrant + record run
│   └── 03_query.py          # Interactive CLI query loop
├── data/                    # Auto-created; Qdrant local storage + chunks.json cache
├── pyproject.toml
└── .env                     # Environment variables (see below)
```

## Setup

### 1. Create virtual environment and install

```bash
cd rag
python -m venv .venv
.venv/Scripts/pip install -e .
```

### 2. Configure `.env`

Copy the example below and fill in your values:

```env
# Required for embeddings
OPENAI_API_KEY=sk-...

# Required for LLM answers (pick one or both; Anthropic is preferred when set)
ANTHROPIC_API_KEY=sk-ant-...

# PostgreSQL — required for vault management and run history
DATABASE_URL=postgresql://user:password@localhost:5432/portfolio_vault

# Qdrant — leave blank to use local file storage under rag/data/qdrant_local/
QDRANT_URL=
QDRANT_API_KEY=

# Encryption key for API keys stored in DB (32+ chars recommended)
# If empty, keys are stored as plain text prefixed with "plain:"
SECRET_KEY=your-random-secret-key

# Optional: set to "1" to force demo mode (no real LLM calls)
DEMO_MODE=

# Model selection (can be overridden at runtime via /settings)
EMBEDDING_MODEL=text-embedding-3-small
ANTHROPIC_MODEL=claude-sonnet-4-6
OPENAI_MODEL=gpt-4o

# Cost guard: block pipeline runs estimated above this USD amount (0 = no limit)
COST_LIMIT_USD=0.0

# Qdrant collection name
QDRANT_COLLECTION=portfolio_vault
```

### 3. First-time database setup

```bash
python scripts/00_migrate_db.py    # create tables
python scripts/00_seed_db.py       # load .md vault files into vault_documents
```

### 4. Run the full index pipeline

```bash
python scripts/02_embed_and_store.py
```

This chunks all documents, calls the OpenAI embedding API, upserts vectors to Qdrant, and records a `PipelineRun` with token count and cost.

### 5. Start the server

```bash
.venv/Scripts/uvicorn.exe app.main:app --reload
# or
python -m app.main
```

The API is available at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

## API Endpoints

All routes are prefixed with `/api/v1`.

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness check |

### Query (RAG)

| Method | Path | Description |
|---|---|---|
| `POST` | `/retrieve` | Semantic search — returns top-k chunks, no LLM |
| `POST` | `/query` | Full RAG — retrieve chunks then generate an answer |

**Query request body:**
```json
{
  "question": "What projects has Daud built?",
  "top_k": 5,
  "category": "project"
}
```

### Vault Management

| Method | Path | Description |
|---|---|---|
| `GET` | `/vault/documents` | Paginated document list |
| `GET` | `/vault/documents/{slug}` | Single document with full content |
| `PUT` | `/vault/documents/{slug}` | Update document content |
| `POST` | `/vault/documents/{slug}/reindex` | Re-embed a single document (background) |
| `GET` | `/vault/documents/{slug}/reindex/{run_id}` | Poll reindex status |

### Pipeline

| Method | Path | Description |
|---|---|---|
| `GET` | `/pipeline/runs` | Paginated list of pipeline runs |
| `GET` | `/pipeline/runs/{run_id}` | Single run detail |
| `GET` | `/pipeline/cost-estimate` | Estimate embedding cost before running |
| `POST` | `/pipeline/run` | Run full index pipeline (Server-Sent Events) |

**SSE events from `POST /pipeline/run`:**
```
data: {"event": "started", "doc_count": 11, "run_id": "..."}
data: {"event": "chunked", "chunk_count": 87}
data: {"event": "embedded", "chunk_count": 87, "token_count": 12500, "cost_usd": 0.00025}
data: {"event": "done", "chunk_count": 87, "run_id": "..."}
```

### Settings

| Method | Path | Description |
|---|---|---|
| `GET` | `/settings` | Current effective settings (keys masked to bool) |
| `PUT` | `/settings` | Update models, API keys, or cost limit |

**Settings update body** (all fields optional):
```json
{
  "openai_api_key": "sk-...",
  "anthropic_api_key": "sk-ant-...",
  "embedding_model": "text-embedding-3-large",
  "anthropic_model": "claude-opus-4-6",
  "openai_model": "gpt-4o-mini",
  "cost_limit_usd": 0.10
}
```

## Architecture Notes

### Settings layering

`get_settings()` loads from `.env` once (cached via `@lru_cache`). The `get_live_settings(request)` dependency runs per-request and overlays DB overrides from the `settings` table. This means API keys and model choices set via `/settings` take effect immediately without restarting.

### API key encryption

Keys are encrypted with Fernet (AES-128-CBC + HMAC) using a SHA-256 derived key from `SECRET_KEY`. If `SECRET_KEY` is empty (dev mode), keys are stored as `plain:<value>` — decryption still works, but keys are readable in the DB.

### Pipeline SSE

`POST /pipeline/run` runs `index_all_docs()` in a thread pool executor and bridges events into an async generator via `queue.Queue`. The frontend connects with `fetch()` + `ReadableStream` (not `EventSource`) because the source is a POST request.

### Cost tracking

- **Embedding**: OpenAI returns `usage.total_tokens`; cost computed from `core/costs.py` price table.
- **Generation**: Anthropic/OpenAI return input/output token counts; cost computed per model.
- Both are logged to `query_logs` (per query) and `pipeline_runs` (per index run).

## Script Reference

| Script | Description |
|---|---|
| `scripts/00_migrate_db.py` | Create all tables (idempotent via `CREATE TABLE IF NOT EXISTS`) |
| `scripts/00_seed_db.py` | Upsert vault `.md` files into `vault_documents` |
| `scripts/01_chunk.py` | Print chunks to stdout (no writes) — useful for tuning |
| `scripts/02_embed_and_store.py` | Full index pipeline with run tracking |
| `scripts/03_query.py` | Interactive CLI: type a question, get an answer |
