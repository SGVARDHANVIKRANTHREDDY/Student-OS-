-- Add role support for admin-gated APIs.
-- Default remains 'user'; admins can be promoted manually in DB.

ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
