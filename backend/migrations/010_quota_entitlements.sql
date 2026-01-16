PRAGMA foreign_keys = ON;

-- Module 5 (Finalization): plan-aware quotas for API + background job enqueues.
-- This is intentionally lightweight: entitlements only (no schema changes).

-- Per-tenant API ceilings (per minute)
INSERT OR IGNORE INTO entitlements (plan_key, feature_key, limit_value, is_enabled, created_at, updated_at) VALUES
  ('FREE_INDIVIDUAL', 'api_requests_per_minute', 600, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- Background job enqueue quotas (per minute)
INSERT OR IGNORE INTO entitlements (plan_key, feature_key, limit_value, is_enabled, created_at, updated_at) VALUES
  ('FREE_INDIVIDUAL', 'enqueue_resume_processing_per_minute', 60, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('FREE_INDIVIDUAL', 'enqueue_resume_matching_per_minute', 120, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('FREE_INDIVIDUAL', 'enqueue_learning_plan_per_minute', 60, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('FREE_INDIVIDUAL', 'enqueue_resume_rendering_per_minute', 30, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- Durable usage-metered ceilings (hourly) for expensive triggers (optional, used by routes)
INSERT OR IGNORE INTO entitlements (plan_key, feature_key, limit_value, is_enabled, created_at, updated_at) VALUES
  ('FREE_INDIVIDUAL', 'matching_triggers_per_hour', 60, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('FREE_INDIVIDUAL', 'matching_retries_per_hour', 10, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('FREE_INDIVIDUAL', 'learning_retries_per_hour', 10, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));
