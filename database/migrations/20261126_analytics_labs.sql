-- VYRON real analytics lab control plane (additive migration).
-- Apply only after a database backup and verifying the current schema.
-- This migration does NOT provision compute or execute user code.

ALTER TABLE memberships
  MODIFY role ENUM('OWNER','ADMIN','MANAGER','LEADER','ANALYST','VIEWER') NOT NULL;

ALTER TABLE invitations
  MODIFY role ENUM('ADMIN','MANAGER','LEADER','ANALYST','VIEWER') NOT NULL;

CREATE TABLE IF NOT EXISTS analytics_labs (
  id CHAR(36) PRIMARY KEY,
  organization_id CHAR(36) NOT NULL,
  project_id CHAR(36) NULL,
  task_id CHAR(36) NULL,
  owner_user_id CHAR(36) NOT NULL,
  lab_name VARCHAR(160) NOT NULL,
  provider VARCHAR(40) NOT NULL DEFAULT 'pending',
  provider_instance_id VARCHAR(255) NULL,
  status ENUM('REQUESTED','PROVISIONING','RUNNING','STOPPED','SUSPENDED','FAILED','DELETING') NOT NULL DEFAULT 'REQUESTED',
  template VARCHAR(80) NOT NULL DEFAULT 'python-analytics',
  region VARCHAR(80) NULL,
  resource_policy_json JSON NOT NULL,
  storage_ref VARCHAR(255) NULL,
  last_activity_at DATETIME NULL,
  expires_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_labs_org_status (organization_id,status,updated_at),
  KEY idx_labs_owner (owner_user_id,status),
  CONSTRAINT fk_lab_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_lab_owner FOREIGN KEY (owner_user_id) REFERENCES users(id),
  CONSTRAINT fk_lab_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  CONSTRAINT fk_lab_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS analytics_lab_access (
  lab_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  access_level ENUM('OWNER','LEADER','ANALYST','READ_ONLY') NOT NULL,
  granted_by CHAR(36) NOT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (lab_id,user_id),
  KEY idx_lab_access_user (user_id,revoked_at),
  CONSTRAINT fk_lab_access_lab FOREIGN KEY (lab_id) REFERENCES analytics_labs(id) ON DELETE CASCADE,
  CONSTRAINT fk_lab_access_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_lab_access_grantor FOREIGN KEY (granted_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS analytics_lab_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lab_id CHAR(36) NOT NULL,
  organization_id CHAR(36) NOT NULL,
  actor_user_id CHAR(36) NULL,
  event_type VARCHAR(80) NOT NULL,
  details_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_lab_events_lab_time (lab_id,created_at),
  KEY idx_lab_events_org_time (organization_id,created_at),
  CONSTRAINT fk_lab_events_lab FOREIGN KEY (lab_id) REFERENCES analytics_labs(id) ON DELETE CASCADE,
  CONSTRAINT fk_lab_events_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_lab_events_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB;
