-- Migration 001: Initial schema
-- Reference DDL — source of truth for schema.
-- Applied by scripts/00_migrate_db.py

BEGIN;

CREATE TABLE IF NOT EXISTS vault_documents (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    type        TEXT        NOT NULL,
    slug        TEXT        NOT NULL UNIQUE,
    title       TEXT        NOT NULL DEFAULT '',
    content     TEXT        NOT NULL DEFAULT '',
    metadata    JSONB       NOT NULL DEFAULT '{}',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vault_documents_type ON vault_documents (type);
CREATE INDEX IF NOT EXISTS idx_vault_documents_slug ON vault_documents (slug);

CREATE TABLE IF NOT EXISTS pipeline_runs (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    triggered_by TEXT        NOT NULL DEFAULT 'manual',
    status       TEXT        NOT NULL DEFAULT 'running',
    doc_ids      JSONB       NOT NULL DEFAULT '[]',
    chunk_count  INTEGER,
    token_count  INTEGER,
    cost_usd     DOUBLE PRECISION,
    model        TEXT,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at  TIMESTAMPTZ,
    error        TEXT
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started_at ON pipeline_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS settings (
    key         TEXT        PRIMARY KEY,
    value       TEXT        NOT NULL DEFAULT '',
    is_secret   BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
