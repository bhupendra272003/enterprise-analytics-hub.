PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS dataset_handoffs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK(stage IN ('CLEANING','SQL_REVIEW','DASHBOARD','RECONCILIATION')),
  status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK(status IN ('ASSIGNED','IN_PROGRESS','SUBMITTED','APPROVED','RETURNED')),
  assigned_to TEXT NOT NULL REFERENCES users(id),
  assigned_by TEXT NOT NULL REFERENCES users(id),
  input_version INTEGER NOT NULL,
  output_version INTEGER,
  handoff_note TEXT NOT NULL DEFAULT '',
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(dataset_id,input_version) REFERENCES dataset_versions(dataset_id,version_number),
  FOREIGN KEY(dataset_id,output_version) REFERENCES dataset_versions(dataset_id,version_number)
);
CREATE INDEX IF NOT EXISTS idx_dataset_handoffs_assignee ON dataset_handoffs(assigned_to,status,updated_at);
CREATE INDEX IF NOT EXISTS idx_dataset_handoffs_dataset ON dataset_handoffs(dataset_id,created_at);
