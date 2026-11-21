-- Vyron 011: auditable task allocation and fair team-performance reporting.
-- Apply only after reviewing and successfully applying migration 010 on a backed-up database.

CREATE TABLE IF NOT EXISTS task_assignment_history (
  id CHAR(36) PRIMARY KEY,
  organization_id CHAR(36) NOT NULL,
  team_id CHAR(36) NULL,
  project_id CHAR(36) NOT NULL,
  task_id CHAR(36) NOT NULL,
  previous_assignee_id CHAR(36) NULL,
  new_assignee_id CHAR(36) NULL,
  assigned_by CHAR(36) NOT NULL,
  reason VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_assignment_org_time (organization_id, created_at),
  KEY idx_assignment_team_member (team_id, new_assignee_id, created_at),
  KEY idx_assignment_actor (assigned_by, created_at),
  CONSTRAINT fk_assignment_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_assignment_team FOREIGN KEY (team_id) REFERENCES teams(id),
  CONSTRAINT fk_assignment_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_assignment_task FOREIGN KEY (task_id) REFERENCES tasks(id),
  CONSTRAINT fk_assignment_previous_user FOREIGN KEY (previous_assignee_id) REFERENCES users(id),
  CONSTRAINT fk_assignment_new_user FOREIGN KEY (new_assignee_id) REFERENCES users(id),
  CONSTRAINT fk_assignment_actor FOREIGN KEY (assigned_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS performance_corrections (
  id CHAR(36) PRIMARY KEY,
  organization_id CHAR(36) NOT NULL,
  subject_user_id CHAR(36) NOT NULL,
  requested_by CHAR(36) NOT NULL,
  task_id CHAR(36) NULL,
  reason TEXT NOT NULL,
  status ENUM('OPEN','REVIEWED','ACCEPTED','DECLINED') NOT NULL DEFAULT 'OPEN',
  reviewed_by CHAR(36) NULL,
  reviewer_note VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL,
  KEY idx_perf_correction_org_status (organization_id, status, created_at),
  CONSTRAINT fk_perf_correction_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_perf_correction_subject FOREIGN KEY (subject_user_id) REFERENCES users(id),
  CONSTRAINT fk_perf_correction_requester FOREIGN KEY (requested_by) REFERENCES users(id),
  CONSTRAINT fk_perf_correction_task FOREIGN KEY (task_id) REFERENCES tasks(id),
  CONSTRAINT fk_perf_correction_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id)
) ENGINE=InnoDB;

ALTER TABLE tasks
  ADD KEY idx_tasks_team_assignee_status (team_id, assignee_id, status),
  ADD KEY idx_tasks_team_assigner (team_id, assigned_by);
