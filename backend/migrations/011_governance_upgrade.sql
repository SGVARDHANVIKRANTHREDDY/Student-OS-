PRAGMA foreign_keys = ON;

-- Module 6 (Governance): Authority separation + first-class skills + curated learning + admin-authored academics/tasks.
-- Additive and backward-compatible.

-- RBAC: add curator role
INSERT OR IGNORE INTO roles (key, name, description) VALUES
  ('LEARNING_CURATOR', 'Learning Content Curator', 'Operator who curates external learning content');

-- RBAC: additional permissions
INSERT OR IGNORE INTO permissions (key, name, description) VALUES
  ('users:read:any', 'Read users (tenant)', 'List users within tenant scope'),
  ('users:export:any', 'Export users (tenant)', 'Export users within tenant scope'),

  ('skills:profile:read:any', 'Read user skills (tenant)', 'Read user skills profiles within tenant scope'),
  ('skills:profile:write:any', 'Write user skills (tenant)', 'Update user skills profiles within tenant scope'),

  ('academics:read:any', 'Read academics (tenant)', 'Read academics for users within tenant scope'),
  ('academics:write', 'Write academics (tenant)', 'Write academics (subjects/marks/attendance) within tenant scope'),

  ('tasks:read:any', 'Read tasks (tenant)', 'Read tasks for users within tenant scope'),
  ('tasks:assign', 'Assign tasks (tenant)', 'Create/update/delete tasks for users within tenant scope'),
  ('tasks:stats', 'Task completion stats (tenant)', 'Read task completion stats within tenant scope'),

  ('learning:courses:read:any', 'Read curated courses (tenant)', 'Read curated courses within tenant scope'),
  ('learning:courses:write', 'Write curated courses (tenant)', 'Create/update curated courses within tenant scope'),

  ('applications:read:any', 'Read applications (tenant)', 'Read applications within tenant scope'),
  ('applications:update:any', 'Update application status (tenant)', 'Update application statuses within tenant scope');

-- Role -> permissions
INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES
  -- College admins operate student lifecycle inside their tenant
  ('COLLEGE_ADMIN', 'users:read:any'),
  ('COLLEGE_ADMIN', 'users:export:any'),
  ('COLLEGE_ADMIN', 'skills:profile:read:any'),
  ('COLLEGE_ADMIN', 'skills:profile:write:any'),
  ('COLLEGE_ADMIN', 'academics:read:any'),
  ('COLLEGE_ADMIN', 'academics:write'),
  ('COLLEGE_ADMIN', 'tasks:read:any'),
  ('COLLEGE_ADMIN', 'tasks:assign'),
  ('COLLEGE_ADMIN', 'tasks:stats'),
  ('COLLEGE_ADMIN', 'learning:courses:read:any'),

  -- Curators manage learning catalog
  ('LEARNING_CURATOR', 'learning:courses:read:any'),
  ('LEARNING_CURATOR', 'learning:courses:write'),

  -- Platform admins can do everything governance-related
  ('PLATFORM_ADMIN', 'users:read:any'),
  ('PLATFORM_ADMIN', 'users:export:any'),
  ('PLATFORM_ADMIN', 'skills:profile:read:any'),
  ('PLATFORM_ADMIN', 'skills:profile:write:any'),
  ('PLATFORM_ADMIN', 'academics:read:any'),
  ('PLATFORM_ADMIN', 'academics:write'),
  ('PLATFORM_ADMIN', 'tasks:read:any'),
  ('PLATFORM_ADMIN', 'tasks:assign'),
  ('PLATFORM_ADMIN', 'tasks:stats'),
  ('PLATFORM_ADMIN', 'learning:courses:read:any'),
  ('PLATFORM_ADMIN', 'learning:courses:write'),
  ('PLATFORM_ADMIN', 'applications:read:any'),
  ('PLATFORM_ADMIN', 'applications:update:any');

-- First-class user skills (tenant-scoped)
CREATE TABLE IF NOT EXISTS user_skills (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  normalized_id TEXT NOT NULL,
  name TEXT NOT NULL,
  proficiency INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('resume', 'learning', 'admin', 'manual')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, user_id, normalized_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_user_skills_tenant_user ON user_skills(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_norm ON user_skills(tenant_id, normalized_id);

-- Curated external courses (operator-authored)
CREATE TABLE IF NOT EXISTS curated_courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  external_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'ARCHIVED')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_curated_courses_tenant_url ON curated_courses(tenant_id, external_url);
CREATE INDEX IF NOT EXISTS idx_curated_courses_tenant_status ON curated_courses(tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS curated_course_skills (
  course_id INTEGER NOT NULL,
  normalized_skill_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  PRIMARY KEY (course_id, normalized_skill_id),
  FOREIGN KEY(course_id) REFERENCES curated_courses(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_curated_course_skills_course ON curated_course_skills(course_id);

CREATE TABLE IF NOT EXISTS user_course_completions (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  course_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED')),
  completed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, user_id, course_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES curated_courses(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_user_course_completions_user ON user_course_completions(tenant_id, user_id, completed_at DESC);

-- Academics: tenant scope + daily attendance
ALTER TABLE academics_meta ADD COLUMN tenant_id TEXT;
ALTER TABLE academics_subjects ADD COLUMN tenant_id TEXT;
ALTER TABLE academics_subjects ADD COLUMN created_by_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_academics_meta_tenant_user ON academics_meta(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_academics_subjects_tenant_user ON academics_subjects(tenant_id, user_id);

-- Backfill tenant_id for existing rows (default tenant)
UPDATE academics_meta SET tenant_id = COALESCE(tenant_id, '00000000-0000-0000-0000-000000000001');
UPDATE academics_subjects SET tenant_id = COALESCE(tenant_id, '00000000-0000-0000-0000-000000000001');

CREATE TABLE IF NOT EXISTS attendance_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PRESENT', 'ABSENT')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (tenant_id, user_id, day),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_attendance_records_user_day ON attendance_records(tenant_id, user_id, day DESC);

-- Tasks: tenant scope + description + author
ALTER TABLE assignments ADD COLUMN tenant_id TEXT;
ALTER TABLE assignments ADD COLUMN description TEXT;
ALTER TABLE assignments ADD COLUMN created_by_user_id TEXT;

ALTER TABLE exams ADD COLUMN tenant_id TEXT;
ALTER TABLE exams ADD COLUMN created_by_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_assignments_tenant_user_due ON assignments(tenant_id, user_id, due_date ASC, id DESC);
CREATE INDEX IF NOT EXISTS idx_exams_tenant_user_date ON exams(tenant_id, user_id, date ASC, id DESC);

UPDATE assignments SET tenant_id = COALESCE(tenant_id, '00000000-0000-0000-0000-000000000001');
UPDATE exams SET tenant_id = COALESCE(tenant_id, '00000000-0000-0000-0000-000000000001');
