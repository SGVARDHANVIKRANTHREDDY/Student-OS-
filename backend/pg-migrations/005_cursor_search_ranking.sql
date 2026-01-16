-- Cursor pagination + ranking foundations (Postgres)

CREATE TABLE IF NOT EXISTS job_match_scores (
  tenant_id UUID NOT NULL,
  user_id TEXT NOT NULL,
  job_id UUID NOT NULL,
  algorithm_version TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id, job_id),
  CONSTRAINT fk_job_match_scores_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

-- Fast join by (tenant,user,job) and optional ordering by recency.
CREATE INDEX IF NOT EXISTS idx_job_match_scores_user_updated
  ON job_match_scores (tenant_id, user_id, updated_at DESC);

-- Keyset pagination support (tenant-scoped, active-only).
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_active_created_id
  ON jobs (tenant_id, is_active, created_at DESC, id DESC);

-- Common browsing mode: internships list.
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_internships_created
  ON jobs (tenant_id, created_at DESC, id DESC)
  WHERE is_active = TRUE AND type = 'internship';
