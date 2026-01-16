PRAGMA foreign_keys = ON;

-- Module 5 (Finalization): account lifecycle & deletion workflow.
-- Additive: does not remove data; enables soft-delete and retention windows.

ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED'));
ALTER TABLE users ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- Track deletion workflow states explicitly (auditable, idempotent).
CREATE TABLE IF NOT EXISTS account_deletions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('REQUESTED', 'SOFT_DELETED', 'PURGED', 'CANCELLED')),
  requested_at TEXT NOT NULL,
  soft_deleted_at TEXT,
  purge_after TEXT,
  purged_at TEXT,
  reason TEXT,
  correlation_id TEXT,
  UNIQUE(tenant_id, user_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_account_deletions_status ON account_deletions(status, requested_at DESC);

-- Backfill existing rows.
UPDATE users SET status = COALESCE(status, 'ACTIVE') WHERE status IS NULL OR status = '';
