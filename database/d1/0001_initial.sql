PRAGMA foreign_keys = ON;

-- NEXUS Analytics D1 schema. SQLite-compatible replacement for the MySQL schema.
-- Keep JSON payloads as TEXT; application code serializes/deserializes them.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL CHECK(length(full_name) <= 120),
  email TEXT NOT NULL UNIQUE CHECK(length(email) <= 254),
  password_hash TEXT NOT NULL,
  account_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(account_status IN ('PENDING','ACTIVE','SUSPENDED')),
  email_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) <= 160),
  slug TEXT NOT NULL UNIQUE CHECK(length(slug) <= 180),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK(role IN ('OWNER','ADMIN','MANAGER','ANALYST','VIEWER')),
  membership_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(membership_status IN ('PENDING','ACTIVE','SUSPENDED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_membership_user ON memberships(user_id);

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  email TEXT NOT NULL CHECK(length(email) <= 254),
  role TEXT NOT NULL CHECK(role IN ('ADMIN','MANAGER','ANALYST','VIEWER')),
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash) = 64),
  invited_by TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_invite_org_email ON invitations(organization_id,email);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id TEXT REFERENCES organizations(id),
  actor_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL CHECK(length(action) <= 100),
  target_type TEXT CHECK(target_type IS NULL OR length(target_type) <= 80),
  target_id TEXT CHECK(target_id IS NULL OR length(target_id) <= 100),
  metadata TEXT,
  ip_address TEXT CHECK(ip_address IS NULL OR length(ip_address) <= 45),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_org_time ON audit_logs(organization_id,created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor_time ON audit_logs(actor_user_id,created_at);

CREATE TABLE IF NOT EXISTS organization_access_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_access_request_queue ON organization_access_requests(organization_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_access_request_user ON organization_access_requests(organization_id,user_id,status);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL CHECK(length(name) <= 160),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'PLANNING' CHECK(status IN ('PLANNING','ACTIVE','ON_HOLD','COMPLETED','ARCHIVED')),
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(priority IN ('LOW','MEDIUM','HIGH','URGENT')),
  start_date TEXT,
  due_date TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_projects_org_updated ON projects(organization_id,updated_at);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL CHECK(length(title) <= 180),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'TODO' CHECK(status IN ('TODO','IN_PROGRESS','BLOCKED','DONE')),
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(priority IN ('LOW','MEDIUM','HIGH','URGENT')),
  due_date TEXT,
  assignee_id TEXT REFERENCES users(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id,status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id,status);

CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL CHECK(length(name) <= 120),
  original_filename TEXT NOT NULL CHECK(length(original_filename) <= 255),
  storage_path TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK(file_size >= 0),
  row_count INTEGER NOT NULL CHECK(row_count >= 0),
  column_count INTEGER NOT NULL CHECK(column_count >= 0),
  columns_json TEXT NOT NULL,
  preview_json TEXT NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_datasets_org_created ON datasets(organization_id,created_at);

CREATE TABLE IF NOT EXISTS dataset_versions (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK(version_number >= 0),
  storage_path TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK(file_size >= 0),
  row_count INTEGER NOT NULL CHECK(row_count >= 0),
  column_count INTEGER NOT NULL CHECK(column_count >= 0),
  columns_json TEXT NOT NULL,
  preview_json TEXT NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  change_note TEXT CHECK(change_note IS NULL OR length(change_note) <= 500),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(dataset_id,version_number)
);
CREATE INDEX IF NOT EXISTS idx_dataset_versions_created ON dataset_versions(dataset_id,created_at);

CREATE TABLE IF NOT EXISTS dataset_validation_runs (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK(version_number >= 0),
  executed_by TEXT NOT NULL REFERENCES users(id),
  rules_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PASSED','FAILED')),
  issue_count INTEGER NOT NULL DEFAULT 0 CHECK(issue_count >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  FOREIGN KEY(dataset_id,version_number) REFERENCES dataset_versions(dataset_id,version_number) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_validation_runs_dataset ON dataset_validation_runs(dataset_id,created_at);

CREATE TABLE IF NOT EXISTS dataset_anomaly_runs (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  from_version INTEGER NOT NULL,
  to_version INTEGER NOT NULL,
  executed_by TEXT NOT NULL REFERENCES users(id),
  anomaly_count INTEGER NOT NULL DEFAULT 0 CHECK(anomaly_count >= 0),
  high_count INTEGER NOT NULL DEFAULT 0 CHECK(high_count >= 0),
  medium_count INTEGER NOT NULL DEFAULT 0 CHECK(medium_count >= 0),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  FOREIGN KEY(dataset_id,from_version) REFERENCES dataset_versions(dataset_id,version_number) ON DELETE CASCADE,
  FOREIGN KEY(dataset_id,to_version) REFERENCES dataset_versions(dataset_id,version_number) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_anomaly_runs_dataset ON dataset_anomaly_runs(dataset_id,created_at);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL CHECK(length(title) <= 160),
  description TEXT CHECK(description IS NULL OR length(description) <= 1000),
  report_url TEXT NOT NULL CHECK(length(report_url) <= 2048),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ARCHIVED')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_reports_org_status ON reports(organization_id,status,created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  organization_id TEXT REFERENCES organizations(id),
  type TEXT NOT NULL CHECK(length(type) <= 40),
  title TEXT NOT NULL CHECK(length(title) <= 180),
  message TEXT NOT NULL CHECK(length(message) <= 500),
  href TEXT CHECK(href IS NULL OR length(href) <= 500),
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id,read_at,created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_org_created ON notifications(organization_id,created_at);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash) = 64),
  purpose TEXT NOT NULL CHECK(purpose IN ('EMAIL_VERIFY','PASSWORD_RESET')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_purpose ON auth_tokens(user_id,purpose,used_at);

-- D1-native session persistence replaces express-mysql-session.
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
