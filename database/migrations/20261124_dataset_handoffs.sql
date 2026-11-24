-- Run once against the Vyron application database before deploying
-- the API that exposes dataset handoffs. No file bytes are copied or exported.
CREATE TABLE IF NOT EXISTS dataset_handoffs (
  id CHAR(36) PRIMARY KEY,
  organization_id CHAR(36) NOT NULL,
  dataset_id CHAR(36) NOT NULL,
  stage VARCHAR(32) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'ASSIGNED',
  assigned_to CHAR(36) NOT NULL,
  assigned_by CHAR(36) NOT NULL,
  input_version INT UNSIGNED NULL,
  output_version INT UNSIGNED NULL,
  handoff_note VARCHAR(1000) NULL,
  review_note VARCHAR(1000) NULL,
  result_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_handoffs_assignee_status (assigned_to,status,updated_at),
  KEY idx_handoffs_dataset (dataset_id,created_at),
  CONSTRAINT fk_handoff_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_handoff_dataset FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  CONSTRAINT fk_handoff_assignee FOREIGN KEY (assigned_to) REFERENCES users(id),
  CONSTRAINT fk_handoff_assigner FOREIGN KEY (assigned_by) REFERENCES users(id),
  CONSTRAINT fk_handoff_input_version FOREIGN KEY (dataset_id,input_version) REFERENCES dataset_versions(dataset_id,version_number),
  CONSTRAINT fk_handoff_output_version FOREIGN KEY (dataset_id,output_version) REFERENCES dataset_versions(dataset_id,version_number)
) ENGINE=InnoDB;
