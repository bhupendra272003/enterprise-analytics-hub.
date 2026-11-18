CREATE DATABASE IF NOT EXISTS enterprise_hub CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE enterprise_hub;

CREATE TABLE users (
  id CHAR(36) PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  account_status ENUM('PENDING','ACTIVE','SUSPENDED') NOT NULL DEFAULT 'PENDING',
  email_verified_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE organizations (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(180) NOT NULL UNIQUE,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_org_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE memberships (
  id CHAR(36) PRIMARY KEY,
  organization_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  role ENUM('OWNER','ADMIN','MANAGER','ANALYST','VIEWER') NOT NULL,
  membership_status ENUM('PENDING','ACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_org_user (organization_id, user_id),
  KEY idx_membership_user (user_id),
  CONSTRAINT fk_membership_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_membership_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE invitations (
  id CHAR(36) PRIMARY KEY,
  organization_id CHAR(36) NOT NULL,
  email VARCHAR(254) NOT NULL,
  role ENUM('ADMIN','MANAGER','ANALYST','VIEWER') NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  invited_by CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  accepted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_invite_org_email (organization_id, email),
  CONSTRAINT fk_invite_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_invite_user FOREIGN KEY (invited_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id CHAR(36) NULL,
  actor_user_id CHAR(36) NULL,
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(80) NULL,
  target_id VARCHAR(100) NULL,
  metadata JSON NULL,
  ip_address VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_org_time (organization_id, created_at),
  KEY idx_audit_actor_time (actor_user_id, created_at),
  CONSTRAINT fk_audit_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE organization_access_requests (
  id CHAR(36) PRIMARY KEY,
  organization_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  status ENUM('PENDING','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  reviewed_by CHAR(36) NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_org_user_access_request (organization_id, user_id),
  KEY idx_access_request_queue (organization_id, status, created_at),
  CONSTRAINT fk_access_request_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_access_request_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_access_request_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id)
) ENGINE=InnoDB;
