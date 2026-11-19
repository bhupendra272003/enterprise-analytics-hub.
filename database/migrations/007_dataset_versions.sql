CREATE TABLE IF NOT EXISTS dataset_versions (
  id CHAR(36) PRIMARY KEY,
  dataset_id CHAR(36) NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  storage_path VARCHAR(1000) NOT NULL,
  file_size BIGINT UNSIGNED NOT NULL,
  row_count BIGINT UNSIGNED NOT NULL,
  column_count INT UNSIGNED NOT NULL,
  columns_json JSON NOT NULL,
  preview_json JSON NOT NULL,
  uploaded_by CHAR(36) NOT NULL,
  change_note VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_dataset_version (dataset_id,version_number),
  KEY idx_dataset_versions_created (dataset_id,created_at),
  CONSTRAINT fk_dataset_versions_dataset FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  CONSTRAINT fk_dataset_versions_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- Preserve datasets uploaded before version history was introduced.
INSERT IGNORE INTO dataset_versions
  (id,dataset_id,version_number,storage_path,file_size,row_count,column_count,columns_json,preview_json,uploaded_by,change_note)
SELECT UUID(),id,1,storage_path,file_size,row_count,column_count,columns_json,preview_json,uploaded_by,'Legacy dataset snapshot'
FROM datasets;
