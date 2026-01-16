PRAGMA foreign_keys = ON;

-- Module 12: Account & access model hardening (additive).
-- Introduces dedicated admin roles and seeds permissions already referenced in routes.

-- Roles (permission-based admin types)
INSERT OR IGNORE INTO roles (key, name, description) VALUES
  ('CONTENT_ADMIN', 'Content Admin', 'Operates learning content and curated resources'),
  ('JOB_ADMIN', 'Job Admin', 'Operates job lifecycle and application pipeline'),
  ('ACADEMIC_ADMIN', 'Academic Admin', 'Operates academics, attendance, and task assignment');

-- Permissions
INSERT OR IGNORE INTO permissions (key, name, description) VALUES
  ('users:read:any', 'Read users (tenant)', 'List users within a tenant for operators'),
  ('users:export:any', 'Export users (tenant)', 'Export user list within a tenant'),

  ('applications:read:any', 'Read applications (tenant)', 'View all applications within a tenant'),
  ('applications:update:any', 'Update application status (tenant)', 'Transition applications within a tenant'),

  ('learning:courses:read:any', 'Read courses (admin)', 'View curated courses across statuses for operators'),
  ('learning:courses:write', 'Write courses', 'Create and update curated courses'),

  ('academics:read:any', 'Read academics (tenant)', 'View academic snapshots for any student in tenant'),
  ('academics:write', 'Write academics', 'Update marks/attendance for students in tenant'),

  ('tasks:read:any', 'Read tasks (tenant)', 'View task assignments for any student in tenant'),
  ('tasks:assign', 'Assign tasks', 'Create, update, and delete task assignments for students'),
  ('tasks:stats', 'Task stats', 'View task completion/coverage stats'),

  ('skills:profile:read:any', 'Read skills profile (tenant)', 'View skills profiles for any student in tenant'),
  ('skills:profile:write:any', 'Write skills profile (tenant)', 'Update skills profiles for any student in tenant');

-- Role -> permissions
-- PLATFORM_ADMIN remains the superset operator role.
INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES
  ('PLATFORM_ADMIN', 'users:read:any'),
  ('PLATFORM_ADMIN', 'users:export:any'),
  ('PLATFORM_ADMIN', 'applications:read:any'),
  ('PLATFORM_ADMIN', 'applications:update:any'),
  ('PLATFORM_ADMIN', 'learning:courses:read:any'),
  ('PLATFORM_ADMIN', 'learning:courses:write'),
  ('PLATFORM_ADMIN', 'academics:read:any'),
  ('PLATFORM_ADMIN', 'academics:write'),
  ('PLATFORM_ADMIN', 'tasks:read:any'),
  ('PLATFORM_ADMIN', 'tasks:assign'),
  ('PLATFORM_ADMIN', 'tasks:stats'),
  ('PLATFORM_ADMIN', 'skills:profile:read:any'),
  ('PLATFORM_ADMIN', 'skills:profile:write:any'),

  ('CONTENT_ADMIN', 'learning:courses:read:any'),
  ('CONTENT_ADMIN', 'learning:courses:write'),

  ('JOB_ADMIN', 'applications:read:any'),
  ('JOB_ADMIN', 'applications:update:any'),
  ('JOB_ADMIN', 'jobs:admin:create'),

  ('ACADEMIC_ADMIN', 'academics:read:any'),
  ('ACADEMIC_ADMIN', 'academics:write'),
  ('ACADEMIC_ADMIN', 'tasks:read:any'),
  ('ACADEMIC_ADMIN', 'tasks:assign'),
  ('ACADEMIC_ADMIN', 'tasks:stats');
