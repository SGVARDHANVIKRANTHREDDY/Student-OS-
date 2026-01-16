-- Admin ingestion requires structured experience bounds + skills.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS experience_min INTEGER,
  ADD COLUMN IF NOT EXISTS experience_max INTEGER,
  ADD COLUMN IF NOT EXISTS skills TEXT[];

CREATE INDEX IF NOT EXISTS idx_jobs_experience_min_max ON jobs (experience_min, experience_max);
CREATE INDEX IF NOT EXISTS idx_jobs_skills_gin ON jobs USING GIN (skills);
