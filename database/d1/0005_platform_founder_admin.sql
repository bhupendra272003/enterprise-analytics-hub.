CREATE TABLE IF NOT EXISTS platform_admins (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role = 'SUPER_ADMIN'),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- The first registered account is the platform founder / initial super admin.
INSERT OR IGNORE INTO platform_admins (user_id, role)
SELECT id, 'SUPER_ADMIN'
FROM users
ORDER BY created_at ASC, id ASC
LIMIT 1;
