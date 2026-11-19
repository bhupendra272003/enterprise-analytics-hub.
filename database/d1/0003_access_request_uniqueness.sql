-- Prevent duplicate pending access requests even under concurrent submissions.
CREATE UNIQUE INDEX IF NOT EXISTS uq_access_request_pending
ON organization_access_requests(organization_id,user_id)
WHERE status='PENDING';
