-- Module 5 (Foundation): Default tenant alignment for Postgres jobs domain.

-- Stable UUID for the default "individual" tenant.
DO $$
BEGIN
  -- Set defaults and backfill existing rows that used NULL tenant_id.
  ALTER TABLE jobs ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
  UPDATE jobs SET tenant_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE tenant_id IS NULL;

  ALTER TABLE saved_jobs ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
  UPDATE saved_jobs SET tenant_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE tenant_id IS NULL;

  ALTER TABLE applications ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
  UPDATE applications SET tenant_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE tenant_id IS NULL;
END $$;
