-- Marketplace upgrade: admin-controlled job + application lifecycle.

-- Jobs lifecycle fields.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Constrain job status (keep default OPEN for backward compatibility).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'jobs'::regclass
      AND contype = 'c'
      AND conname = 'jobs_status_check'
  ) THEN
    ALTER TABLE jobs DROP CONSTRAINT jobs_status_check;
  END IF;

  ALTER TABLE jobs
    ADD CONSTRAINT jobs_status_check
    CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED'));
END $$;

CREATE INDEX IF NOT EXISTS idx_jobs_status_created_at ON jobs (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_deadline_at ON jobs (tenant_id, deadline_at);

-- Applications: ensure status set includes the marketplace contract.
-- Keep OFFERED in check constraint for backward compatibility (older data),
-- but the API will normalize OFFERED -> SELECTED.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'applications'::regclass
      AND contype = 'c'
      AND conname = 'applications_status_check'
  ) THEN
    ALTER TABLE applications DROP CONSTRAINT applications_status_check;
  END IF;

  ALTER TABLE applications
    ADD CONSTRAINT applications_status_check
    CHECK (status IN ('APPLIED', 'SHORTLISTED', 'REJECTED', 'SELECTED', 'OFFERED'));
END $$;

-- Useful for auto-reject scans.
CREATE INDEX IF NOT EXISTS idx_applications_job_status ON applications (job_id, status);
