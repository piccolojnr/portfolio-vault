BEGIN;

CREATE TABLE IF NOT EXISTS jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'pending',
  attempts        INT NOT NULL DEFAULT 0,
  max_attempts    INT NOT NULL DEFAULT 3,
  error           TEXT,
  error_trace     TEXT,
  worker_id       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  scheduled_for   TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_scheduled
  ON jobs(status, scheduled_for)
  WHERE status IN ('pending', 'retrying');

CREATE INDEX IF NOT EXISTS idx_jobs_type_status
  ON jobs(type, status);

COMMIT;
