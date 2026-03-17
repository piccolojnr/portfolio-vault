-- 002_add_corpus_id.sql
-- Adds corpus_id column to existing documents tables.
-- Safe to run on a fresh DB (ADD COLUMN IF NOT EXISTS is a no-op).

BEGIN;

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS corpus_id TEXT NOT NULL DEFAULT 'portfolio_vault';

CREATE INDEX IF NOT EXISTS idx_documents_corpus_id ON documents (corpus_id);

COMMIT;
