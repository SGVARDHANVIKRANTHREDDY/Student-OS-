-- Module 5 (Governance): Align application status with platform contract (APPLIED/SELECTED/REJECTED).

DO $$
BEGIN
  -- Drop existing status CHECK constraint if present.
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
    CHECK (status IN ('APPLIED', 'SELECTED', 'REJECTED', 'SHORTLISTED', 'OFFERED'));
END $$;
