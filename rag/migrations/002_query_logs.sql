-- Migration 002: query_logs table for tracking LLM query costs
CREATE TABLE IF NOT EXISTS query_logs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question     TEXT        NOT NULL,
    model        VARCHAR(100),
    provider     VARCHAR(50),
    input_tokens INTEGER,
    output_tokens INTEGER,
    total_tokens INTEGER,
    cost_usd     NUMERIC(12, 8),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
