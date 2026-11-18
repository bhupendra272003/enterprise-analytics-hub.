CREATE TABLE IF NOT EXISTS organization_access_requests (
  id CHAR(36) PRIMARY KEY,
  organization_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  status ENUM('PENDING','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  reviewed_by CHAR(36) NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_access_request_queue (organization_id, status, created_at),
  KEY idx_access_request_user (organization_id, user_id, status),
  CONSTRAINT fk_access_request_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_access_request_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_access_request_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id)
) ENGINE=InnoDB;
