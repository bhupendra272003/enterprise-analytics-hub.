-- Activate only an already-verified platform founder account.
-- Ordinary pending users and suspended accounts are deliberately untouched.
UPDATE users
SET account_status = 'ACTIVE',
    updated_at = CURRENT_TIMESTAMP
WHERE account_status = 'PENDING'
  AND email_verified_at IS NOT NULL
  AND id IN (
    SELECT user_id
    FROM platform_admins
    WHERE role = 'SUPER_ADMIN'
  );
