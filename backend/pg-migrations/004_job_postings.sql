-- Module 5 (Ingestion readiness): Job posting lifecycle (draft -> submitted -> approved/rejected/archived).

CREATE TABLE IF NOT EXISTS job_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  created_by_user_id TEXT NOT NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('RECRUITER', 'COLLEGE_ADMIN', 'PLATFORM_ADMIN')),

  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ARCHIVED')),

  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('job', 'internship')),
  experience_level TEXT NOT NULL,
  experience_min INTEGER,
  experience_max INTEGER,
  description TEXT NOT NULL,
  requirements TEXT NOT NULL,
  skills TEXT[],

  submitted_at TIMESTAMPTZ,
  reviewed_by_user_id TEXT,
  reviewed_at TIMESTAMPTZ,
  review_reason TEXT,

  published_job_id UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_job_postings_published_job FOREIGN KEY (published_job_id) REFERENCES jobs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_job_postings_tenant_status_created ON job_postings (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_postings_created_by ON job_postings (created_by_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_postings_submitted ON job_postings (tenant_id, submitted_at DESC) WHERE status = 'SUBMITTED';
