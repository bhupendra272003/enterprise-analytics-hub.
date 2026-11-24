-- Permit durable SQL execution jobs while preserving existing job records and indexes.
CREATE TABLE dataset_jobs_next (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL REFERENCES users(id),
  job_type TEXT NOT NULL CHECK(job_type IN ('CLEAN','PROFILE','VALIDATE','ANOMALIES','ROW_COMPARE','SQL')),
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','RUNNING','RETRYING','COMPLETED','FAILED','CANCELLED')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  stage TEXT NOT NULL DEFAULT 'QUEUED' CHECK(length(stage) <= 80),
  payload_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT,
  error_code TEXT CHECK(error_code IS NULL OR length(error_code) <= 80),
  error_message TEXT CHECK(error_message IS NULL OR length(error_message) <= 500),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK(max_attempts BETWEEN 1 AND 10),
  queue_message_id TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO dataset_jobs_next
SELECT id,organization_id,dataset_id,requested_by,job_type,status,progress,stage,payload_json,result_json,error_code,error_message,attempt_count,max_attempts,queue_message_id,started_at,completed_at,created_at,updated_at
FROM dataset_jobs;
DROP TABLE dataset_jobs;
ALTER TABLE dataset_jobs_next RENAME TO dataset_jobs;
CREATE INDEX IF NOT EXISTS idx_dataset_jobs_org_created ON dataset_jobs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dataset_jobs_dataset_created ON dataset_jobs(dataset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dataset_jobs_status_created ON dataset_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_dataset_jobs_requester_created ON dataset_jobs(requested_by, created_at DESC);
