PRAGMA foreign_keys = ON;

-- Module 5 (Scaffolding): Plans, entitlements, and per-tenant usage counters.

CREATE TABLE IF NOT EXISTS plans (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DEPRECATED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tenant_plans (
  tenant_id TEXT PRIMARY KEY,
  plan_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  effective_from TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(plan_key) REFERENCES plans(key) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_tenant_plans_plan ON tenant_plans(plan_key, tenant_id);

-- Entitlements are plan-scoped feature gates/limits.
-- limit_value is interpreted by feature_key (count/month, count/day, etc.).
CREATE TABLE IF NOT EXISTS entitlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_key TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  limit_value INTEGER,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(plan_key, feature_key),
  FOREIGN KEY(plan_key) REFERENCES plans(key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_entitlements_plan ON entitlements(plan_key, feature_key);

-- Usage counters aggregated per tenant and period.
-- period_key format: YYYY-MM for monthly periods (initially).
CREATE TABLE IF NOT EXISTS usage_counters (
  tenant_id TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  period_key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, feature_key, period_key),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_usage_counters_feature_period ON usage_counters(feature_key, period_key);

-- Seed a default plan for individuals.
INSERT OR IGNORE INTO plans (key, name, status, created_at, updated_at)
VALUES (
  'FREE_INDIVIDUAL',
  'Free Individual',
  'ACTIVE',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

INSERT OR IGNORE INTO tenant_plans (tenant_id, plan_key, status, effective_from, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'FREE_INDIVIDUAL',
  'ACTIVE',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

-- Seed baseline entitlements.
INSERT OR IGNORE INTO entitlements (plan_key, feature_key, limit_value, is_enabled, created_at, updated_at) VALUES
  ('FREE_INDIVIDUAL', 'resume_uploads_per_month', 25, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('FREE_INDIVIDUAL', 'resume_renders_per_month', 50, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('FREE_INDIVIDUAL', 'job_applications_per_month', 200, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));
