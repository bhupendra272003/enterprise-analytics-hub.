-- Vyron governance foundation: four roles, teams, contribution events and Owner generator controls.
-- Review legacy-role mapping before applying to a populated production database.
-- Legacy ADMIN maps to MANAGER (administrative power is removed); VIEWER maps to ANALYST
-- only after the organization Owner reviews the member's new access. Back up first.

UPDATE memberships SET role='MANAGER' WHERE role='ADMIN';
UPDATE memberships SET role='ANALYST' WHERE role='VIEWER';
UPDATE invitations SET role='MANAGER' WHERE role='ADMIN';
UPDATE invitations SET role='ANALYST' WHERE role='VIEWER';

ALTER TABLE memberships
  MODIFY role ENUM('OWNER','MANAGER','LEADER','ANALYST') NOT NULL;
ALTER TABLE invitations
  MODIFY role ENUM('MANAGER','LEADER','ANALYST') NOT NULL;

CREATE TABLE IF NOT EXISTS teams (
  id CHAR(36) PRIMARY KEY,
  organization_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  leader_user_id CHAR(36) NULL,
  status ENUM('ACTIVE','PAUSED','ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  created_by CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_teams_org_status (organization_id,status),
  CONSTRAINT fk_teams_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_teams_leader FOREIGN KEY (leader_user_id) REFERENCES users(id),
  CONSTRAINT fk_teams_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS team_members (
  team_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  added_by CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (team_id,user_id),
  KEY idx_team_members_user (user_id),
  CONSTRAINT fk_team_members_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_team_members_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_team_members_added_by FOREIGN KEY (added_by) REFERENCES users(id)
) ENGINE=InnoDB;

ALTER TABLE tasks
  ADD COLUMN team_id CHAR(36) NULL,
  ADD COLUMN assigned_by CHAR(36) NULL,
  ADD COLUMN submitted_at DATETIME NULL,
  ADD COLUMN reviewed_at DATETIME NULL,
  ADD COLUMN review_status ENUM('NOT_SUBMITTED','PENDING','ACCEPTED','REVISION_REQUIRED') NOT NULL DEFAULT 'NOT_SUBMITTED',
  ADD KEY idx_tasks_team_status (team_id,status),
  ADD CONSTRAINT fk_tasks_team FOREIGN KEY (team_id) REFERENCES teams(id),
  ADD CONSTRAINT fk_tasks_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id);

CREATE TABLE IF NOT EXISTS work_events (
  id CHAR(36) PRIMARY KEY,
  organization_id CHAR(36) NOT NULL,
  team_id CHAR(36) NULL,
  project_id CHAR(36) NULL,
  task_id CHAR(36) NULL,
  actor_user_id CHAR(36) NOT NULL,
  event_type ENUM('TASK_ASSIGNED','TASK_STARTED','TASK_BLOCKED','TASK_SUBMITTED','TASK_ACCEPTED','TASK_REVISION_REQUESTED','TASK_REOPENED','DATA_CLEANED','DATA_VALIDATED','ANALYSIS_SUBMITTED','DASHBOARD_SUBMITTED','PEER_REVIEWED','HANDOFF_COMPLETED') NOT NULL,
  evidence_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_work_events_org_time (organization_id,created_at),
  KEY idx_work_events_actor_time (actor_user_id,created_at),
  KEY idx_work_events_task (task_id,created_at),
  CONSTRAINT fk_work_events_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_work_events_team FOREIGN KEY (team_id) REFERENCES teams(id),
  CONSTRAINT fk_work_events_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_work_events_task FOREIGN KEY (task_id) REFERENCES tasks(id),
  CONSTRAINT fk_work_events_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS generator_settings (
  organization_id CHAR(36) PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  max_rows_per_job BIGINT UNSIGNED NOT NULL DEFAULT 0,
  max_rows_per_dataset BIGINT UNSIGNED NOT NULL DEFAULT 0,
  max_batch_rows INT UNSIGNED NOT NULL DEFAULT 5000,
  approved_industries_json JSON NOT NULL,
  updated_by CHAR(36) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_generator_settings_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_generator_settings_user FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS generation_jobs (
  id CHAR(36) PRIMARY KEY,
  organization_id CHAR(36) NOT NULL,
  requested_by CHAR(36) NOT NULL,
  status ENUM('QUEUED','RUNNING','PAUSED','COMPLETED','FAILED','CANCELLED') NOT NULL DEFAULT 'QUEUED',
  industry VARCHAR(80) NOT NULL,
  config_json JSON NOT NULL,
  requested_rows BIGINT UNSIGNED NOT NULL,
  generated_rows BIGINT UNSIGNED NOT NULL DEFAULT 0,
  progress_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  idempotency_key VARCHAR(190) NOT NULL,
  error_code VARCHAR(80) NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_generation_idempotency (organization_id,idempotency_key),
  KEY idx_generation_org_status (organization_id,status,created_at),
  CONSTRAINT fk_generation_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_generation_requester FOREIGN KEY (requested_by) REFERENCES users(id)
) ENGINE=InnoDB;
