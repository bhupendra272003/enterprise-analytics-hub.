CREATE TABLE IF NOT EXISTS dataset_validation_runs (
  id CHAR(36) PRIMARY KEY,
  dataset_id CHAR(36) NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  executed_by CHAR(36) NOT NULL,
  rules_json JSON NOT NULL,
  result_json JSON NOT NULL,
  status ENUM('PASSED','FAILED') NOT NULL,
  issue_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_validation_runs_dataset (dataset_id,created_at),
  CONSTRAINT fk_validation_runs_dataset FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  CONSTRAINT fk_validation_runs_version FOREIGN KEY (dataset_id,version_number) REFERENCES dataset_versions(dataset_id,version_number) ON DELETE CASCADE,
  CONSTRAINT fk_validation_runs_user FOREIGN KEY (executed_by) REFERENCES users(id)
) ENGINE=InnoDB;
