-- Vyron D1 governance foundation: exactly four membership roles, team ownership,
-- assignment evidence, work events and Owner-controlled generator configuration.
-- Legacy ADMIN/VIEWER are downgraded to MANAGER (read-only), never elevated.
PRAGMA foreign_keys = OFF;

CREATE TABLE memberships_v2 (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK(role IN ('OWNER','MANAGER','LEADER','ANALYST')),
  membership_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(membership_status IN ('PENDING','ACTIVE','SUSPENDED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id,user_id)
);
INSERT INTO memberships_v2 (id,organization_id,user_id,role,membership_status,created_at)
SELECT id,organization_id,user_id,
  CASE WHEN role IN ('ADMIN','VIEWER') THEN 'MANAGER' ELSE role END,
  membership_status,created_at
FROM memberships;
DROP TABLE memberships;
ALTER TABLE memberships_v2 RENAME TO memberships;
CREATE INDEX IF NOT EXISTS idx_membership_user ON memberships(user_id);

CREATE TABLE invitations_v2 (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  email TEXT NOT NULL CHECK(length(email) <= 254),
  role TEXT NOT NULL CHECK(role IN ('MANAGER','LEADER','ANALYST')),
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash) = 64),
  invited_by TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO invitations_v2 (id,organization_id,email,role,token_hash,invited_by,expires_at,accepted_at,created_at)
SELECT id,organization_id,email,
  CASE WHEN role IN ('ADMIN','VIEWER') THEN 'MANAGER' ELSE role END,
  token_hash,invited_by,expires_at,accepted_at,created_at
FROM invitations;
DROP TABLE invitations;
ALTER TABLE invitations_v2 RENAME TO invitations;
CREATE INDEX IF NOT EXISTS idx_invite_org_email ON invitations(organization_id,email);

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 120),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 500),
  leader_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','PAUSED','ARCHIVED')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id,leader_user_id)
);
CREATE INDEX idx_teams_org_status ON teams(organization_id,status);

CREATE TABLE team_members (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  added_by TEXT NOT NULL REFERENCES users(id),
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(team_id,user_id),
  UNIQUE(user_id,team_id)
);
CREATE INDEX idx_team_members_user ON team_members(user_id);

ALTER TABLE tasks ADD COLUMN team_id TEXT REFERENCES teams(id);
ALTER TABLE tasks ADD COLUMN assigned_by TEXT REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN completed_at TEXT;
CREATE INDEX idx_tasks_team_assignee ON tasks(team_id,assignee_id,status);

CREATE TABLE task_assignment_history (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  assigned_by TEXT NOT NULL REFERENCES users(id),
  previous_assignee_id TEXT REFERENCES users(id),
  new_assignee_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT CHECK(reason IS NULL OR length(reason) <= 500),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_assignment_team_time ON task_assignment_history(team_id,created_at);
CREATE INDEX idx_assignment_assignee_time ON task_assignment_history(new_assignee_id,created_at);
CREATE INDEX idx_assignment_actor_time ON task_assignment_history(assigned_by,created_at);

CREATE TABLE work_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  team_id TEXT REFERENCES teams(id),
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('TASK_CREATED','TASK_ASSIGNED','TASK_STARTED','TASK_BLOCKED','TASK_SUBMITTED','TASK_ACCEPTED','TASK_REOPENED','TASK_STATUS_CHANGED','WORK_NOTE_ADDED')),
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_work_events_org_time ON work_events(organization_id,created_at);
CREATE INDEX idx_work_events_team_actor ON work_events(team_id,actor_user_id,created_at);
CREATE INDEX idx_work_events_task ON work_events(task_id,created_at);

CREATE TABLE performance_corrections (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  team_id TEXT REFERENCES teams(id),
  member_user_id TEXT NOT NULL REFERENCES users(id),
  requested_by TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 1000),
  evidence_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_performance_corrections_org ON performance_corrections(organization_id,status,created_at);

CREATE TABLE generator_settings (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  per_dataset_row_cap INTEGER NOT NULL DEFAULT 0 CHECK(per_dataset_row_cap >= 0),
  per_job_row_cap INTEGER NOT NULL DEFAULT 0 CHECK(per_job_row_cap >= 0),
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE generation_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  requested_by TEXT NOT NULL REFERENCES users(id),
  industry TEXT NOT NULL,
  dataset_key TEXT NOT NULL,
  requested_rows INTEGER NOT NULL CHECK(requested_rows > 0),
  generated_rows INTEGER NOT NULL DEFAULT 0 CHECK(generated_rows >= 0),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','QUEUED','RUNNING','PAUSED','COMPLETED','FAILED','CANCELLED')),
  seed TEXT,
  result_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE INDEX idx_generation_jobs_org ON generation_jobs(organization_id,created_at DESC);

PRAGMA foreign_keys = ON;
