-- 004_add_ai_calls.sql
-- Replace narrow query_logs with ai_calls: one table for every LLM/embedding
-- call across the whole system (chat, summarise, query, embed, intent).
--
-- query_logs is dropped — it is a subset of this table and was never fully wired.

BEGIN;

DROP TABLE IF EXISTS query_logs;

CREATE TABLE IF NOT EXISTS ai_calls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_type       TEXT NOT NULL,        -- 'chat' | 'summarise' | 'query' | 'embed' | 'intent'
  model           TEXT NOT NULL,
  provider        TEXT NOT NULL,        -- 'anthropic' | 'openai'
  input_tokens    INT,
  output_tokens   INT,
  cost_usd        NUMERIC(10, 6),
  job_id          UUID,                 -- nullable ref to jobs.id
  conversation_id UUID,                 -- nullable ref to conversations.id
  doc_id          UUID,                 -- nullable ref to documents.id
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_calls_created_at  ON ai_calls (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_calls_call_type   ON ai_calls (call_type);
CREATE INDEX IF NOT EXISTS idx_ai_calls_conv        ON ai_calls (conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_calls_doc         ON ai_calls (doc_id)          WHERE doc_id IS NOT NULL;

COMMIT;
