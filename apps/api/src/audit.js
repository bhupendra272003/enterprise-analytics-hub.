import { pool } from './db.js';
export async function audit({ orgId = null, actorId = null, action, targetType = null, targetId = null, metadata = null, ip = null }) {
  await pool.execute(
    'INSERT INTO audit_logs (organization_id, actor_user_id, action, target_type, target_id, metadata, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [orgId, actorId, action, targetType, targetId, metadata ? JSON.stringify(metadata) : null, ip]
  );
}