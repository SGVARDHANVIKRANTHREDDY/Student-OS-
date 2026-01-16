PRAGMA foreign_keys = ON;

-- Module 4: Trust, Observability, User Awareness (additive).

-- Immutable, user-visible activity timeline.
CREATE TABLE IF NOT EXISTS activity_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT,
  related_entity_type TEXT,
  related_entity_id TEXT,
  job_type TEXT,
  bullmq_job_id TEXT,
  correlation_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_activity_events_user_id ON activity_events(user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_user_type ON activity_events(user_id, event_type, id DESC);

-- User notifications (in-app required; email future-safe).
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  activity_event_id INTEGER,
  delivery_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  read_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(activity_event_id) REFERENCES activity_events(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, is_read, id DESC);

-- Durable job status snapshots for async pipelines (queue state mirrored into DB).
CREATE TABLE IF NOT EXISTS job_status_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  queue_name TEXT,
  job_name TEXT,
  bullmq_job_id TEXT,
  correlation_id TEXT,
  status TEXT NOT NULL,
  attempts_made INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER,
  last_error_public TEXT,
  last_error_code TEXT,
  payload_json TEXT,
  enqueued_at TEXT,
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, job_type, scope_type, scope_key),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_job_status_user_updated ON job_status_snapshots(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_status_user_type ON job_status_snapshots(user_id, job_type, updated_at DESC);

-- Audit logs for sensitive actions (admin-ready, backend-only).
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type TEXT NOT NULL,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  correlation_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_type, actor_user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id, id DESC);
