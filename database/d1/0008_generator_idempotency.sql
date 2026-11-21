-- Prevent duplicate synthetic generation jobs when a client retries a request.
ALTER TABLE generation_jobs ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_generation_jobs_org_idempotency
  ON generation_jobs(organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
