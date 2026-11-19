CREATE TABLE IF NOT EXISTS dataset_anomaly_runs (
  id CHAR(36) PRIMARY KEY,
  dataset_id CHAR(36) NOT NULL,
  from_version INT UNSIGNED NOT NULL,
  to_version INT UNSIGNED NOT NULL,
  executed_by CHAR(36) NOT NULL,
  anomaly_count INT UNSIGNED NOT NULL DEFAULT 0,
  high_count INT UNSIGNED NOT NULL DEFAULT 0,
  medium_count INT UNSIGNED NOT NULL DEFAULT 0,
  result_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_anomaly_runs_dataset (dataset_id,created_at),
  CONSTRAINT fk_anomaly_runs_dataset FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  CONSTRAINT fk_anomaly_runs_from_version FOREIGN KEY (dataset_id,from_version) REFERENCES dataset_versions(dataset_id,version_number) ON DELETE CASCADE,
  CONSTRAINT fk_anomaly_runs_to_version FOREIGN KEY (dataset_id,to_version) REFERENCES dataset_versions(dataset_id,version_number) ON DELETE CASCADE,
  CONSTRAINT fk_anomaly_runs_user FOREIGN KEY (executed_by) REFERENCES users(id)
) ENGINE=InnoDB;
