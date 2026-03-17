-- 001_init.sql — full schema (source of truth)
-- Applied by: rag migrate
-- Wiped and re-applied by: rag migrate-fresh
--
-- Tables
--   documents       — corpus documents (text + uploaded files)
--   pipeline_runs   — ingestion pipeline audit log
--   settings        — runtime key/value config (encrypted secrets)
--   query_logs      — per-query LLM cost audit
--   conversations   — chat sessions
--   messages        — chat turns (user + assistant)

BEGIN;

-- ── documents ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    corpus_id TEXT NOT NULL DEFAULT 'portfolio_vault',
    type TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT '',
    extracted_text TEXT NOT NULL DEFAULT '',
    source_type TEXT NOT NULL DEFAULT 'text', -- 'text' | 'file'
    file_path TEXT,
    file_size INTEGER,
    mimetype TEXT,
    file_hash TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_corpus_id ON documents (corpus_id);
CREATE INDEX IF NOT EXISTS idx_documents_type      ON documents (type);
CREATE INDEX IF NOT EXISTS idx_documents_slug      ON documents (slug);

CREATE INDEX IF NOT EXISTS idx_documents_file_hash ON documents (file_hash)
WHERE
    file_hash IS NOT NULL;

-- ── pipeline_runs ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pipeline_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    triggered_by TEXT NOT NULL DEFAULT 'manual',
    status TEXT NOT NULL DEFAULT 'running',
    doc_ids JSONB NOT NULL DEFAULT '[]',
    chunk_count INTEGER,
    token_count INTEGER,
    cost_usd DOUBLE PRECISION,
    model TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started_at ON pipeline_runs (started_at DESC);

-- ── settings ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    is_secret BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── query_logs ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS query_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    question TEXT NOT NULL,
    model VARCHAR(100),
    provider VARCHAR(50),
    input_tokens INTEGER,
    output_tokens INTEGER,
    total_tokens INTEGER,
    cost_usd NUMERIC(12, 8),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── conversations ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    title TEXT,
    summary TEXT,
    summarised_up_to_message_id UUID, -- FK added after messages table below
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── messages ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    conversation_id UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    doc_type TEXT,
    meta JSONB,
    sources JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conv_created_idx ON messages (conversation_id, created_at);

-- Add the deferred FK now that messages exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_conv_summarised_up_to'
      AND table_name = 'conversations'
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT fk_conv_summarised_up_to
      FOREIGN KEY (summarised_up_to_message_id) REFERENCES messages (id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

COMMIT;