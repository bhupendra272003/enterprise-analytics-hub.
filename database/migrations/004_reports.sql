CREATE TABLE IF NOT EXISTS reports (
  id CHAR(36) PRIMARY KEY,
  organization_id CHAR(36) NOT NULL,
  title VARCHAR(160) NOT NULL,
  description VARCHAR(1000) NULL,
  report_url VARCHAR(2048) NOT NULL,
  status ENUM('ACTIVE','ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  created_by CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_reports_org_status (organization_id,status,created_at),
  CONSTRAINT fk_reports_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_reports_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;
