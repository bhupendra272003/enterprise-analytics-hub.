CREATE TABLE IF NOT EXISTS datasets (
  id CHAR(36) PRIMARY KEY,
  organization_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  storage_path VARCHAR(1000) NOT NULL,
  file_size BIGINT UNSIGNED NOT NULL,
  row_count BIGINT UNSIGNED NOT NULL,
  column_count INT UNSIGNED NOT NULL,
  columns_json JSON NOT NULL,
  preview_json JSON NOT NULL,
  uploaded_by CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_datasets_org_created (organization_id,created_at),
  CONSTRAINT fk_datasets_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_datasets_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB;
