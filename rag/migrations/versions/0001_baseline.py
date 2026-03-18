"""Baseline: full schema as of the four custom SQL migrations.

Captures the final state after:
  001_init.sql        — documents, pipeline_runs, settings, query_logs, conversations, messages
  002_add_corpus_id   — documents.corpus_id column + index
  003_add_jobs        — jobs table + indexes
  004_add_ai_calls    — drop query_logs, create ai_calls table + indexes

Existing databases
------------------
If your database was created with the old ``rag migrate`` command, stamp it
at this revision so Alembic knows it is already up-to-date:

    rag stamp          # runs: alembic stamp 0001

Fresh databases
---------------
A plain ``rag migrate`` (alembic upgrade head) will execute upgrade() below
and create the full schema from scratch.

Revision ID: 0001
Revises: —
Create Date: 2026-03-18
"""
from __future__ import annotations

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    op.execute("""
-- ── documents ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    corpus_id       TEXT        NOT NULL    DEFAULT 'portfolio_vault',
    type            TEXT        NOT NULL,
    slug            TEXT        NOT NULL    UNIQUE,
    title           TEXT        NOT NULL    DEFAULT '',
    extracted_text  TEXT        NOT NULL    DEFAULT '',
    source_type     TEXT        NOT NULL    DEFAULT 'text',
    file_path       TEXT,
    file_size       INTEGER,
    mimetype        TEXT,
    file_hash       TEXT,
    metadata        JSONB       NOT NULL    DEFAULT '{}',
    updated_at      TIMESTAMPTZ NOT NULL    DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL    DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_corpus_id ON documents (corpus_id);
CREATE INDEX IF NOT EXISTS idx_documents_type      ON documents (type);
CREATE INDEX IF NOT EXISTS idx_documents_slug      ON documents (slug);
CREATE INDEX IF NOT EXISTS idx_documents_file_hash ON documents (file_hash)
    WHERE file_hash IS NOT NULL;

-- ── pipeline_runs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_runs (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    triggered_by TEXT         NOT NULL    DEFAULT 'manual',
    status       TEXT         NOT NULL    DEFAULT 'running',
    doc_ids      JSONB        NOT NULL    DEFAULT '[]',
    chunk_count  INTEGER,
    token_count  INTEGER,
    cost_usd     DOUBLE PRECISION,
    model        TEXT,
    started_at   TIMESTAMPTZ  NOT NULL    DEFAULT now(),
    finished_at  TIMESTAMPTZ,
    error        TEXT
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started_at ON pipeline_runs (started_at DESC);

-- ── settings ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
    key        TEXT    PRIMARY KEY,
    value      TEXT    NOT NULL    DEFAULT '',
    is_secret  BOOLEAN NOT NULL    DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── conversations ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title                       TEXT,
    summary                     TEXT,
    summarised_up_to_message_id UUID,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── messages ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID        NOT NULL    REFERENCES conversations (id) ON DELETE CASCADE,
    role            TEXT        NOT NULL    CHECK (role IN ('user', 'assistant')),
    content         TEXT        NOT NULL,
    doc_type        TEXT,
    meta            JSONB,
    sources         JSONB,
    created_at      TIMESTAMPTZ NOT NULL    DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conv_created_idx ON messages (conversation_id, created_at);

-- Deferred FK: conversations → messages (added after messages is created)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE  constraint_name = 'fk_conv_summarised_up_to'
          AND  table_name      = 'conversations'
    ) THEN
        ALTER TABLE conversations
            ADD CONSTRAINT fk_conv_summarised_up_to
            FOREIGN KEY (summarised_up_to_message_id)
            REFERENCES messages (id)
            DEFERRABLE INITIALLY DEFERRED;
    END IF;
END $$;

-- ── jobs ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    type          TEXT        NOT NULL,
    payload       JSONB       NOT NULL    DEFAULT '{}',
    status        TEXT        NOT NULL    DEFAULT 'pending',
    attempts      INT         NOT NULL    DEFAULT 0,
    max_attempts  INT         NOT NULL    DEFAULT 3,
    error         TEXT,
    error_trace   TEXT,
    worker_id     TEXT,
    created_at    TIMESTAMPTZ NOT NULL    DEFAULT now(),
    scheduled_for TIMESTAMPTZ NOT NULL    DEFAULT now(),
    started_at    TIMESTAMPTZ,
    finished_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_scheduled ON jobs (status, scheduled_for)
    WHERE status IN ('pending', 'retrying');
CREATE INDEX IF NOT EXISTS idx_jobs_type_status ON jobs (type, status);

-- ── ai_calls ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_calls (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    call_type       TEXT        NOT NULL,
    model           TEXT        NOT NULL,
    provider        TEXT        NOT NULL,
    input_tokens    INT,
    output_tokens   INT,
    cost_usd        NUMERIC(10, 6),
    job_id          UUID,
    conversation_id UUID,
    doc_id          UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_calls_created_at ON ai_calls (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_calls_call_type  ON ai_calls (call_type);
CREATE INDEX IF NOT EXISTS idx_ai_calls_conv ON ai_calls (conversation_id)
    WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_calls_doc  ON ai_calls (doc_id)
    WHERE doc_id IS NOT NULL;
""")


def downgrade() -> None:
    # Drop in reverse dependency order (FK-safe)
    op.execute("""
DROP TABLE IF EXISTS ai_calls        CASCADE;
DROP TABLE IF EXISTS jobs            CASCADE;
DROP TABLE IF EXISTS messages        CASCADE;
DROP TABLE IF EXISTS conversations   CASCADE;
DROP TABLE IF EXISTS settings        CASCADE;
DROP TABLE IF EXISTS pipeline_runs   CASCADE;
DROP TABLE IF EXISTS documents       CASCADE;
""")
