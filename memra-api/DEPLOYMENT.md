# Memra Deployment Guide

This guide documents end-to-end deployment setup for `memra-api`, including:

- Supabase Postgres (database)
- Supabase Storage (file uploads)
- Qdrant (vector storage)
- Neo4j Aura (graph storage)
- Paystack (billing)
- Background worker process
- Railway deployment layout

---

## 1) Architecture at a Glance

Production runtime has 3 process roles:

- `web`: FastAPI app (`gunicorn memra.app.main:app ...`)
- `worker`: background jobs (`memra worker`)
- `release`: one-time migrations on deploy (`alembic upgrade head`)

Current `Procfile`:

- `web: gunicorn ...`
- `worker: memra worker`
- `release: alembic upgrade head`

---

## 2) Prerequisites

- Railway project (recommended for `memra-api`)
- Supabase project
- Qdrant cluster (cloud)
- Neo4j Aura database
- Paystack account with plans configured
- Domain/URL for frontend app (used by auth callbacks and billing redirects)

---

## 3) Environment Variables (Backend)

Set these in Railway service variables (or equivalent secret manager).

### Required

- `DATABASE_URL`
- `QDRANT_URL`
- `QDRANT_API_KEY`
- `SECRET_KEY` (stable 32+ bytes hex/string)
- `JWT_SECRET`
- `APP_URL` (frontend base URL, e.g. `https://app.example.com`)

### Strongly recommended

- `ADMIN_JWT_SECRET`
- `ENVIRONMENT=production`
- `GUNICORN_WORKERS` (start with `2-4`, tune with CPU/memory)
- `CORS_ORIGINS` (comma-separated explicit origins)
- `LOG_LEVEL=INFO`

### AI Providers

Set at least one:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

### Neo4j

- `NEO4J_URI` (Aura URI)
- `NEO4J_USERNAME` (usually `neo4j`)
- `NEO4J_PASSWORD`

### Storage provider

- `STORAGE_PROVIDER=local` or `supabase`
- If `supabase`:
  - `SUPABASE_STORAGE_URL`
  - `SUPABASE_STORAGE_KEY`
  - `STORAGE_BUCKET` (default `documents`)

### Email

- `EMAIL_BACKEND` = `console` | `mailpit` | `resend`
- `EMAIL_FROM`
- If `resend`: `RESEND_API_KEY`

### Paystack (important)

Implementation supports env fallback, but canonical source is platform settings in DB.

You can bootstrap with env vars:

- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_PUBLIC_KEY`
- `PAYSTACK_PRO_PLAN_CODE`
- `PAYSTACK_ENTERPRISE_PLAN_CODE`

Then set/manage in Platform Admin Settings UI for long-term consistency.

---

## 4) Supabase Setup

### 4.1 Postgres (DATABASE_URL)

Use Supabase pooled connection string (transaction mode) for multi-worker deployments.

Checklist:

- Copy connection string from Supabase
- Put in `DATABASE_URL`
- Verify app can run migrations (`release` command)

### 4.2 Storage

1. Create bucket (e.g. `documents`)
2. Set bucket policy to match your access model
3. Set:
   - `STORAGE_PROVIDER=supabase`
   - `SUPABASE_STORAGE_URL`
   - `SUPABASE_STORAGE_KEY`
   - `STORAGE_BUCKET=documents`

Smoke test:

- Upload via `/api/v1/documents/upload`
- Verify stored path and public URL behavior in app

---

## 5) Qdrant Setup

Set:

- `QDRANT_URL`
- `QDRANT_API_KEY`

Important:

- Do **not** rely on old `default` collection assumptions.
- Health checks now validate LightRAG collections:
  - `lightrag_vdb_entities`
  - `lightrag_vdb_relationships`
  - `lightrag_vdb_chunks`

These are created/initialized when ingestion runs.

After first deployment:

1. Upload or seed at least one document
2. Ensure worker is running
3. Confirm ingestion completes and collections exist

---

## 6) Neo4j Aura Setup

Set:

- `NEO4J_URI`
- `NEO4J_USERNAME`
- `NEO4J_PASSWORD`

Health endpoint checks runtime connectivity (`RETURN 1`).

Note on TLS issues:

- If you see `Unable to retrieve routing information` with certificate chain errors in non-production, code includes a development fallback for trust handling.
- In production, use proper CA trust/certificate chain and keep strict verification.

---

## 7) Paystack Setup

### 7.1 In Paystack dashboard

1. Create plans:
   - Pro
   - Enterprise
2. Copy plan codes
3. Get secret/public keys (test or live, matching mode)

### 7.2 In Memra platform settings

Set:

- `paystack_secret_key` (secret)
- `paystack_public_key`
- `paystack_pro_plan_code`
- `paystack_enterprise_plan_code`

### 7.3 Webhook

Configure Paystack webhook endpoint:

- `POST <API_BASE_URL>/api/v1/webhooks/paystack`

Ensure:

- Public HTTPS URL
- App can verify `x-paystack-signature`
- Events reach backend and are recorded

---

## 8) Railway Deployment (Recommended)

Current repository is already configured for Railway via:

- `railway.toml` (Dockerfile builder + healthcheck path)
- `Dockerfile`
- `Procfile` (`web`, `worker`, `release`)

### 8.1 Service model

Use at least:

- 1 x web process
- 1 x worker process

### 8.2 Health check

Railway uses:

- `/api/v1/health`

### 8.3 Release command

- `alembic upgrade head`

This must pass before traffic is served.

---

## 9) Background Worker Requirement

`memra worker` is mandatory in production for:

- document ingestion
- re-ingestion
- email jobs
- billing reconciliation jobs

If worker is down:

- uploads queue but do not fully ingest
- billing/email async tasks stall
- health may show worker issues

---

## 10) First Deploy Checklist

1. Configure all env vars
2. Deploy `web` + `worker`
3. Verify release migration succeeds
4. Hit `/api/v1/health` and `/api/platform/health/detailed`
5. Create platform admin user (`memra create-admin`) if needed
6. Configure Paystack settings in Platform Admin UI
7. Upload a document and confirm ingestion reaches `ready`
8. Confirm Qdrant and Neo4j health become `ok`

---

## 11) Post-Deploy Verification Commands

From service logs / API checks:

- `GET /api/v1/health`
- `GET /api/platform/health/detailed` (admin auth required)

Expected:

- `database.status = ok`
- `qdrant.status = ok`
- `neo4j.status = ok` (if configured)
- `storage.status = ok`
- `paystack.status = ok` or `not_configured` (before billing setup)

---

## 12) Common Failure Modes

- **Qdrant errors**
  - Cause: no ingestion yet / bad API key / wrong URL
  - Fix: verify credentials, run ingestion, check worker logs

- **Neo4j routing error**
  - Cause: URI/auth/TLS trust chain mismatch
  - Fix: verify Aura credentials + TLS trust path

- **Paystack preflight not ok**
  - Cause: missing keys/plan codes or mode mismatch
  - Fix: set all four Paystack settings and confirm test/live consistency

- **Worker not processing**
  - Cause: worker process not running
  - Fix: run `worker` process in Railway

- **Uploads succeed but no retrieval results**
  - Cause: ingestion job failed or pending
  - Fix: inspect job queue and document `lightrag_status`

