PRAGMA foreign_keys = ON;

-- Module 3: Resume → Matching → Learning Loop
-- Additive, backward-compatible schema.

-- Resume is now a first-class domain model.

CREATE TABLE IF NOT EXISTS resume_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  current_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_resume_documents_user_id ON resume_documents(user_id);

-- Status lifecycle:
-- UPLOADED -> PARSING -> PARSED
-- FAILED, OUTDATED
CREATE TABLE IF NOT EXISTS resume_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resume_document_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  version_label TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_meta_json TEXT NOT NULL DEFAULT '{}',
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  error_text TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  parsed_at TEXT,
  UNIQUE(resume_document_id, version),
  UNIQUE(resume_document_id, version_label),
  FOREIGN KEY(resume_document_id) REFERENCES resume_documents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_resume_versions_doc_id ON resume_versions(resume_document_id);
CREATE INDEX IF NOT EXISTS idx_resume_versions_status ON resume_versions(status);
CREATE INDEX IF NOT EXISTS idx_resume_versions_hash ON resume_versions(content_hash);

-- Optional file backing (e.g., uploaded PDF).
CREATE TABLE IF NOT EXISTS resume_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resume_version_id INTEGER NOT NULL UNIQUE,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  size_bytes INTEGER,
  original_filename TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(resume_version_id) REFERENCES resume_versions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_resume_files_version_id ON resume_files(resume_version_id);

-- Parsed snapshot storage (durable JSON).
CREATE TABLE IF NOT EXISTS resume_parsed_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resume_version_id INTEGER NOT NULL UNIQUE,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(resume_version_id) REFERENCES resume_versions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_resume_parsed_snapshots_version_id ON resume_parsed_snapshots(resume_version_id);

-- Deterministic, explainable matching results (never recompute blindly).
CREATE TABLE IF NOT EXISTS resume_job_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  tenant_id TEXT,
  job_id TEXT NOT NULL,
  resume_version_label TEXT NOT NULL,
  resume_version_id INTEGER,
  algorithm_version TEXT NOT NULL,
  match_score INTEGER NOT NULL,
  breakdown_json TEXT NOT NULL,
  missing_skills_json TEXT NOT NULL,
  strengths_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, tenant_id, job_id, resume_version_label, algorithm_version),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(resume_version_id) REFERENCES resume_versions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_resume_job_matches_user_id ON resume_job_matches(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_resume_job_matches_job_id ON resume_job_matches(job_id);

-- User job targets (used to trigger matching/learning loop).
CREATE TABLE IF NOT EXISTS resume_targets (
  user_id TEXT NOT NULL,
  tenant_id TEXT,
  job_id TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, tenant_id, job_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_resume_targets_user_id ON resume_targets(user_id, updated_at DESC);

-- Learning plans generated from skill gaps (stored + versioned).
CREATE TABLE IF NOT EXISTS learning_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  tenant_id TEXT,
  job_id TEXT NOT NULL,
  resume_version_label TEXT NOT NULL,
  resume_version_id INTEGER,
  plan_version INTEGER NOT NULL,
  status TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, tenant_id, job_id, resume_version_label, plan_version),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(resume_version_id) REFERENCES resume_versions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_learning_plans_user_id ON learning_plans(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_plans_job_id ON learning_plans(job_id);

CREATE TABLE IF NOT EXISTS learning_plan_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learning_plan_id INTEGER NOT NULL,
  item_key TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(learning_plan_id, item_key),
  FOREIGN KEY(learning_plan_id) REFERENCES learning_plans(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_learning_plan_items_plan_id ON learning_plan_items(learning_plan_id);

-- LaTeX-based resume engine primitives (templates + render outputs).
CREATE TABLE IF NOT EXISTS latex_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_key TEXT NOT NULL,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  latex_source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(template_key, version)
);
CREATE INDEX IF NOT EXISTS idx_latex_templates_key ON latex_templates(template_key, version DESC);

CREATE TABLE IF NOT EXISTS resume_renders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  tenant_id TEXT,
  resume_version_label TEXT NOT NULL,
  resume_version_id INTEGER,
  template_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  output_pdf_path TEXT,
  error_text TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(resume_version_id) REFERENCES resume_versions(id) ON DELETE SET NULL,
  FOREIGN KEY(template_id) REFERENCES latex_templates(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_resume_renders_user_id ON resume_renders(user_id, updated_at DESC);
