PRAGMA foreign_keys = ON;

-- Module 5 (Foundation): Multi-tenancy + RBAC (additive, backward-compatible).

-- Tenants
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('INDIVIDUAL', 'COLLEGE', 'RECRUITER', 'PLATFORM')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tenants_kind ON tenants(kind);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

-- Default tenant: "individual".
-- Stable UUID so we can share the same tenant_id across subsystems (SQLite + Postgres).
INSERT OR IGNORE INTO tenants (id, slug, name, kind, status, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'individual',
  'Individual',
  'INDIVIDUAL',
  'ACTIVE',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

-- Each user belongs to exactly one tenant.
CREATE TABLE IF NOT EXISTS tenant_memberships (
  user_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_user ON tenant_memberships(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_status ON tenant_memberships(status);

-- Backfill existing users into the default tenant.
INSERT OR IGNORE INTO tenant_memberships (user_id, tenant_id, status, created_at, updated_at)
SELECT
  u.id,
  '00000000-0000-0000-0000-000000000001',
  'ACTIVE',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users u;

-- RBAC: roles & permissions (platform-wide definitions)
CREATE TABLE IF NOT EXISTS roles (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS permissions (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_key TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  PRIMARY KEY (role_key, permission_key),
  FOREIGN KEY(role_key) REFERENCES roles(key) ON DELETE CASCADE,
  FOREIGN KEY(permission_key) REFERENCES permissions(key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_role_permissions_perm ON role_permissions(permission_key, role_key);

-- Per-tenant role assignments.
CREATE TABLE IF NOT EXISTS tenant_role_assignments (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, user_id, role_key),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(role_key) REFERENCES roles(key) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_tenant_role_assignments_user ON tenant_role_assignments(user_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_role_assignments_role ON tenant_role_assignments(role_key, tenant_id);

-- Seed roles
INSERT OR IGNORE INTO roles (key, name, description) VALUES
  ('STUDENT', 'Student', 'Individual student account'),
  ('COLLEGE_ADMIN', 'College Admin', 'College tenant administrator'),
  ('RECRUITER', 'Recruiter', 'Recruiter tenant operator'),
  ('PLATFORM_ADMIN', 'Platform Admin', 'Platform-wide administrative operator');

-- Seed permissions (minimal initial contract)
INSERT OR IGNORE INTO permissions (key, name, description) VALUES
  ('platform:admin', 'Platform administration', 'Operate and govern platform-level resources'),
  ('jobs:admin:create', 'Create jobs (admin)', 'Create and publish jobs directly (platform/admin ingestion)'),
  ('postings:job:create', 'Create job posting', 'Create a draft job posting'),
  ('postings:job:submit', 'Submit job posting', 'Submit a job posting for review'),
  ('postings:job:review', 'Review job postings', 'View submitted job postings for review'),
  ('postings:job:approve', 'Approve job postings', 'Approve submitted job postings'),
  ('postings:job:reject', 'Reject job postings', 'Reject submitted job postings');

-- Role -> permissions
INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES
  ('RECRUITER', 'postings:job:create'),
  ('RECRUITER', 'postings:job:submit'),
  ('COLLEGE_ADMIN', 'postings:job:create'),
  ('COLLEGE_ADMIN', 'postings:job:submit'),
  ('PLATFORM_ADMIN', 'platform:admin'),
  ('PLATFORM_ADMIN', 'jobs:admin:create'),
  ('PLATFORM_ADMIN', 'postings:job:review'),
  ('PLATFORM_ADMIN', 'postings:job:approve'),
  ('PLATFORM_ADMIN', 'postings:job:reject');

-- Backfill tenant role assignments.
-- All existing users are students by default.
INSERT OR IGNORE INTO tenant_role_assignments (tenant_id, user_id, role_key, status, created_at, updated_at)
SELECT
  tm.tenant_id,
  tm.user_id,
  'STUDENT',
  'ACTIVE',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM tenant_memberships tm;

-- Preserve legacy admin role behavior by mapping it into PLATFORM_ADMIN.
INSERT OR IGNORE INTO tenant_role_assignments (tenant_id, user_id, role_key, status, created_at, updated_at)
SELECT
  tm.tenant_id,
  u.id,
  'PLATFORM_ADMIN',
  'ACTIVE',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users u
JOIN tenant_memberships tm ON tm.user_id = u.id
WHERE u.role = 'admin';

-- Tenant-aware enrichment for Module 4 artifacts (auditing/ops)
ALTER TABLE activity_events ADD COLUMN tenant_id TEXT;
CREATE INDEX IF NOT EXISTS idx_activity_events_tenant_user_id ON activity_events(tenant_id, user_id, id DESC);

ALTER TABLE notifications ADD COLUMN tenant_id TEXT;
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_user_id ON notifications(tenant_id, user_id, is_read, id DESC);

ALTER TABLE job_status_snapshots ADD COLUMN tenant_id TEXT;
CREATE INDEX IF NOT EXISTS idx_job_status_tenant_user_updated ON job_status_snapshots(tenant_id, user_id, updated_at DESC);

ALTER TABLE audit_logs ADD COLUMN tenant_id TEXT;
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON audit_logs(tenant_id, id DESC);
