# Project Handover — Portfolio Vault RAG

> **Purpose:** Full context document for a new agent picking up this project.
> **Date:** 2026-03-18
> **Branch:** `lightrag` (working branch — `main` is the base)

---

## What This Project Is

A **multi-tenant RAG (Retrieval-Augmented Generation) application** built for portfolio management. It allows organisations to:

- Upload and manage documents (markdown, PDF, DOCX, etc.)
- Index them into a knowledge base using LightRAG (graph-based) or legacy Qdrant (vector-only)
- Chat with the knowledge base via a streaming AI assistant
- Manage teams with role-based access (owner / admin / member)
- Configure AI models, API keys, cost limits, and per-org system prompts at runtime

It was originally a personal portfolio vault (bio, skills, projects) and has evolved into a general-purpose multi-tenant document RAG platform.

---

## Monorepo Structure

```
portfolio-vault/
├── rag/                        # FastAPI backend (Python)
│   ├── src/portfolio_rag/      # Main package
│   ├── migrations/             # Alembic DB migrations
│   ├── pyproject.toml
│   └── .env                    # Environment config (see below)
├── portfolio-assistant/        # Next.js 14 frontend (TypeScript)
│   ├── src/
│   └── package.json            # Use pnpm (not npm)
├── 02_projects/                # Markdown vault files (project docs)
├── bio.md, skills.md, etc.     # Personal vault markdown files
└── HANDOVER.md                 # This file
```

---

## Tech Stack

### Backend (`rag/`)
| Layer | Technology |
|-------|-----------|
| HTTP framework | FastAPI + Uvicorn |
| Database | PostgreSQL 15 + SQLModel (async, asyncpg) |
| Migrations | Alembic (12 migrations so far) |
| Vector DB | Qdrant (cloud — `QDRANT_URL` in .env) |
| Graph RAG | LightRAG-HKU 1.4.10 |
| LLM | Anthropic Claude (primary) + OpenAI (fallback) |
| Embeddings | OpenAI `text-embedding-3-small` |
| Encryption | Fernet (cryptography lib) — for DB-stored API keys |
| Auth | JWT (PyJWT, HS256) + bcrypt passwords + magic links |
| Email | Mailpit (dev) / Resend (prod) via Jinja2 templates |
| File storage | Local filesystem or Supabase S3 |
| Rate limiting | SlowAPI |
| Export | WeasyPrint (PDF) + python-docx (DOCX) |

### Frontend (`portfolio-assistant/`)
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Components | Shadcn/ui |
| State | React Query (TanStack) + React Context |
| Package manager | **pnpm** (not npm) |
| Auth | JWT cookies (`access_token` httpOnly=false, `refresh_token` httpOnly=true) |
| Chat streaming | Server-Sent Events (SSE) |

---

## Architecture

### Backend Layer Structure

```
app/           HTTP layer — routers, dependencies, FastAPI factory
  api/v1/      One file per feature (auth, chat, documents, orgs, etc.)
  core/        Config, DB engine, dependencies, security, CLI

domain/        Business logic — no HTTP, no DB implementation details
  models/      Pydantic schemas (request/response shapes)
  services/    All service logic (auth_service, chat_pipeline, org_service, etc.)

infrastructure/ External systems
  db/          SQLModel ORM tables + repository base classes
  llm/         OpenAI + Anthropic API wrappers
  vector/      Qdrant client
  storage/     Local / Supabase file storage
  email/       Email backends + Jinja2 templates

shared/        Cross-cutting utilities (crypto, costs, context)
```

### Frontend Route Structure

```
src/app/
  (app)/       Protected routes — require auth + onboarding
    page.tsx              → Chat interface (main page, /)
    documents/            → Document CRUD (list, new, ingest, edit)
    admin/                → Admin only (Jobs, AI Costs, Settings)
      layout.tsx          → Sub-nav tabs: Jobs | AI Costs | Settings
      jobs/               → Background job queue viewer
      ai-calls/           → AI call analytics + costs
      settings/           → API keys, model selection, cost limits
    settings/
      page.tsx            → redirects → /admin/settings
      profile/            → User profile (display name, use case)
      organisation/       → Org name, knowledge base, members, invites,
                            system prompt, transfer ownership
    graph/                → LightRAG knowledge graph visualisation
    onboarding/           → First-time setup (use case selection)

  (public)/    Unauthenticated routes
    login/, register/, auth/*
```

### API Proxy Pattern (Frontend → Backend)

All frontend API calls go through Next.js route handlers (`src/app/api/`) which act as authenticated proxies to the FastAPI backend. This keeps the backend URL server-side and forwards the user's access token via `Authorization: Bearer <token>`.

The shared helper is `src/lib/server-fetch.ts` → `serverFetch()`.

---

## Database Schema (12 Migrations)

| Migration | What it adds |
|-----------|-------------|
| 0001 | `documents`, `pipeline_runs`, `app_setting` |
| 0002 | `users`, `refresh_tokens`, `magic_link_tokens`, `password_reset_tokens` |
| 0003 | `organisations`, `organisation_members`, `organisation_invites` |
| 0004 | Adds `org_id` FK to documents, pipeline_runs, settings |
| 0005 | Creates default org for existing data |
| 0006 | `ai_calls` table + org scoping |
| 0007 | `onboarding_completed_at`, `use_case` on users |
| 0008 | `jobs` table; `org_id` nullable for system emails |
| 0009 | `corpora` table; `active_corpus_id` on organisations |
| 0010 | Composite UNIQUE `(org_id, slug)` on documents |
| 0011 | `conversations`, `messages`; user-scoped conversations |
| 0012 | `display_name` on users |

Key tables not covered by an ORM model file directly:
- `organisation_settings` — org-level key/value store (used for per-org system prompt). Model: `OrganisationSetting`.

---

## Auth Flow

1. **Register/Login** → backend issues `access_token` (15 min JWT) + `refresh_token` (30 day, httpOnly cookie, `path="/"`)
2. **Frontend** stores `access_token` in a non-httpOnly cookie (readable by JS for attaching to requests)
3. **Next.js middleware** reads both cookies on every request; if access token is expired but refresh token exists, performs a **silent refresh** by calling `POST /api/v1/auth/refresh` server-side, writes fresh tokens to response cookies
4. **API routes** call `serverFetch()` which reads the access token and adds `Authorization: Bearer` header
5. **Backend** validates JWT on every protected endpoint via `get_current_user()` dependency

JWT payload fields: `sub` (user_id), `org_id`, `role`, `email`, `email_verified`, `onboarding_completed_at`, `org_name`, `display_name`, `type` (access/refresh)

**Known past bugs (fixed):**
- Refresh cookie was `path="/api/v1/auth"` — browser never sent it on page requests → middleware couldn't read it → silent refresh never worked. Fixed to `path="/"`.
- `samesite="strict"` broke magic link flows. Fixed to `samesite="lax"`.

### Role System
| Role | Permissions |
|------|------------|
| `owner` | Everything; transfer ownership, delete org |
| `admin` | Manage members, invites, documents, settings, system prompt |
| `member` | Read-only: view docs, chat, view profile/org settings |

Members are blocked from `/admin/*`, `/documents/new`, `/documents/ingest`, `/documents/*/edit` (both middleware redirect + backend 403).

---

## Multi-Tenancy Model

- Every resource (documents, conversations, jobs, ai_calls) is scoped to `org_id`
- Conversations are additionally scoped to `user_id`
- The active JWT carries `org_id` — all backend queries filter by it
- Users can belong to multiple orgs and switch via `POST /auth/switch-org` (issues a new access token scoped to the new org)
- Each org has a `Corpus` (knowledge base) — `active_corpus_id` on the `organisations` table determines which corpus is queried in chat

---

## RAG Pipeline

### LightRAG (current default, `use_legacy_retrieval=false`)
1. Document uploaded → stored (local/Supabase)
2. Background job: `ingest_document(doc_id)` → `lightrag_service.ingest()`
3. LightRAG extracts entities/relationships, builds a graph, stores in:
   - Qdrant (vector embeddings)
   - PostgreSQL (KV store via `PGKVStorage`)
   - NetworkX (graph — Apache AGE not available)
4. Chat: `POST /chat` → `chat_pipeline` → LightRAG hybrid query → LLM generation → SSE stream

### Legacy (Qdrant-only, `use_legacy_retrieval=true`)
1. Chunk documents by headings → embed → store in Qdrant
2. Chat: cosine similarity retrieval → LLM with retrieved chunks

Switch: set `use_legacy_retrieval` in the `app_setting` table (no redeploy needed).

### Intent Classification
Every chat message is classified first (using a fast cheap model — Haiku/GPT-4o-mini) to decide whether to retrieve from the knowledge base or answer directly.

---

## Runtime Settings (DB-Override Pattern)

Settings from `.env` can be overridden at runtime via the `app_setting` table. The `GET/PUT /api/v1/settings` endpoint manages this.

`get_live_settings(request)` dependency:
1. Loads base `Settings` from env
2. Queries `app_setting` table for overrides (decrypts secret values)
3. If user has a valid JWT, checks `organisation_settings` for an org-level `system_prompt` override
4. Returns merged `Settings` object

Secret keys (OpenAI, Anthropic) are encrypted with Fernet before DB storage. `SECRET_KEY` in `.env` is the encryption key.

---

## Environment Variables (`rag/.env`)

```env
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/portfolio_vault

# Qdrant (cloud)
QDRANT_URL=https://<id>.gcp.cloud.qdrant.io
QDRANT_API_KEY=<key>

# LLM (can also be set in DB via /admin/settings)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Auth
JWT_SECRET=<random-hex>
JWT_ACCESS_EXPIRY_MINUTES=15
JWT_REFRESH_EXPIRY_DAYS=30

# Encryption (for DB-stored API keys)
SECRET_KEY=<random-hex>

# Email
EMAIL_BACKEND=mailpit          # console | mailpit | resend
RESEND_API_KEY=re_...
APP_URL=http://localhost:3000   # Used in email links

# Storage
STORAGE_PROVIDER=local          # local | supabase
STORAGE_BUCKET=documents

# Feature flags
USE_LEGACY_RETRIEVAL=false      # true = Qdrant-only, false = LightRAG
```

Frontend `.env.local`:
```env
RAG_BACKEND_URL=http://localhost:8000
JWT_SECRET=<must match backend>
NEXT_PUBLIC_API_URL=/api
```

---

## How to Run

### Backend
```bash
cd rag
pip install -e .                          # install package
alembic upgrade head                      # apply migrations
uvicorn portfolio_rag.app.main:app --reload --port 8000
```

Or via CLI:
```bash
rag db migrate                            # run migrations
rag db seed                               # seed sample vault documents
rag worker                                # start background job worker
```

### Frontend
```bash
cd portfolio-assistant
pnpm install
pnpm dev                                  # http://localhost:3000
```

---

## Key Files Quick Reference

| Purpose | File |
|---------|------|
| FastAPI app factory + router registration | `rag/src/portfolio_rag/app/main.py` |
| All env settings | `rag/src/portfolio_rag/app/core/config.py` |
| DB session dependency | `rag/src/portfolio_rag/app/core/db.py` |
| Auth + live settings dependencies | `rag/src/portfolio_rag/app/core/dependencies.py` |
| JWT create/verify | `rag/src/portfolio_rag/app/core/security.py` |
| Auth endpoints | `rag/src/portfolio_rag/app/api/v1/auth.py` |
| Chat streaming endpoint | `rag/src/portfolio_rag/app/api/v1/chat.py` |
| Org membership/invites/system-prompt | `rag/src/portfolio_rag/app/api/v1/orgs.py` |
| DB-backed settings (global + org) | `rag/src/portfolio_rag/domain/services/settings_db.py` |
| Chat pipeline orchestration | `rag/src/portfolio_rag/domain/services/chat_pipeline.py` |
| LightRAG service registry | `rag/src/portfolio_rag/domain/services/lightrag_service.py` |
| Document ingestion | `rag/src/portfolio_rag/domain/services/ingestion_service.py` |
| All DB models (re-export) | `rag/src/portfolio_rag/infrastructure/db/__init__.py` |
| Next.js middleware (auth gates) | `portfolio-assistant/src/middleware.ts` |
| Auth context + silent refresh | `portfolio-assistant/src/components/auth-provider.tsx` |
| Authenticated proxy helper | `portfolio-assistant/src/lib/server-fetch.ts` |
| Generic API client (client-side) | `portfolio-assistant/src/lib/api.ts` |
| Chat UI | `portfolio-assistant/src/components/chat-interface.tsx` |
| Admin settings page | `portfolio-assistant/src/app/(app)/admin/settings/page.tsx` |
| Org settings + system prompt | `portfolio-assistant/src/app/(app)/settings/organisation/page.tsx` |

---

## Recent Work (Last Several Commits)

1. **Org-scoped system prompt** — per-org assistant persona stored in `organisation_settings`, overlaid in `get_live_settings()` from JWT org_id; editable via Organisation settings page
2. **Settings page restructure** — split `/settings` (was mixed) into `/admin/settings` (API keys, models, cost limits) and `/settings/organisation` (system prompt). `/settings` now redirects to `/admin/settings`
3. **Auth cookie bug fix** — refresh cookie was scoped to `path="/api/v1/auth"` so browser never sent it on page requests; middleware silent refresh was always broken. Fixed to `path="/"` + `samesite="lax"`
4. **User-scoped conversations** — each user only sees their own conversations
5. **Role-based access control** — members are read-only across UI and API
6. **Multi-tenant corpus scoping** — each org selects its active knowledge base
7. **Full auth system** — JWT, magic links, email verification, password reset, org invites, org switching

---

## Known Gotchas / Design Decisions

- **`pnpm` only** — the frontend uses pnpm. Do not use npm or yarn.
- **LightRAG graph storage** — Apache AGE (PostgreSQL extension for graphs) is unavailable, so NetworkXStorage is used instead. This means the graph is in-memory and rebuilt on startup from the PG KV store.
- **LightRAG concurrent extraction** — `llm_model_max_async=2` to control LLM costs during indexing.
- **JSONB dirty tracking** — SQLAlchemy doesn't detect in-place JSONB mutations. Use full dict reassignment (`doc.metadata = {**doc.metadata, "key": val}`) instead of `doc.metadata["key"] = val`.
- **`get_live_settings()` is called on every request** — it opens a DB session and reads settings. Org-system-prompt overlay decodes JWT inline (read-only, not validated again — the route handler already validated it).
- **Supabase storage key encryption** — stored encrypted in `app_setting` alongside OpenAI/Anthropic keys. `SECRET_KEY` env var must be set for proper encryption; falls back to `plain:` prefix if missing.
- **Alembic vs SQLModel** — both are used. Alembic handles DDL migrations; `SQLModel.metadata.create_all()` is used in some CLI helpers for dev convenience. In production, always run `alembic upgrade head`.
- **Demo mode** — if `DEMO_MODE=1` or no API keys are set, the app runs in demo mode with canned responses.
