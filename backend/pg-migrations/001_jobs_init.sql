-- Jobs & Applications domain (Postgres-only)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('job', 'internship')),
  experience_level TEXT NOT NULL,
  description TEXT NOT NULL,
  requirements TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_jobs_active_created_at ON jobs (is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs (type);
CREATE INDEX IF NOT EXISTS idx_jobs_location ON jobs (location);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs (company);
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_id ON jobs (tenant_id);

-- Simple full-text search over title/company/location.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(company, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(location, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_jobs_search_tsv ON jobs USING GIN (search_tsv);

CREATE TABLE IF NOT EXISTS saved_jobs (
  user_id TEXT NOT NULL,
  job_id UUID NOT NULL,
  tenant_id UUID NULL,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, job_id),
  CONSTRAINT fk_saved_jobs_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_saved_jobs_user_id ON saved_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_saved_jobs_job_id ON saved_jobs (job_id);
CREATE INDEX IF NOT EXISTS idx_saved_jobs_tenant_id ON saved_jobs (tenant_id);

CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  job_id UUID NOT NULL,
  tenant_id UUID NULL,
  resume_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('APPLIED', 'SHORTLISTED', 'REJECTED', 'OFFERED')),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_applications_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE RESTRICT,
  CONSTRAINT uq_applications_user_job UNIQUE (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications (user_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications (status);
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications (job_id);
CREATE INDEX IF NOT EXISTS idx_applications_tenant_id ON applications (tenant_id);
