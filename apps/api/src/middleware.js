import { pool } from './db.js';
export function requireAuth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: 'Authentication required.' });
  next();
}
export function requireActiveUser(req, res, next) {
  if (!req.user || req.user.account_status !== 'ACTIVE') return res.status(403).json({ error: 'Account is not active.' });
  next();
}
export async function loadUser(req, res, next) {
  try {
    if (!req.session?.userId) return next();
    const [rows] = await pool.execute('SELECT id, full_name, email, account_status, email_verified_at FROM users WHERE id = ? LIMIT 1', [req.session.userId]);
    req.user = rows[0] || null;
    next();
  } catch (err) { next(err); }
}
export function requireRole(...allowedRoles) {
  return async (req, res, next) => {
    try {
      const orgId = req.params.orgId || req.body.organizationId;
      if (!orgId) return res.status(400).json({ error: 'Organization ID is required.' });
      const [rows] = await pool.execute("SELECT role FROM memberships WHERE organization_id = ? AND user_id = ? AND membership_status = 'ACTIVE' LIMIT 1", [orgId, req.user.id]);
      if (!rows[0] || !allowedRoles.includes(rows[0].role)) return res.status(403).json({ error: 'Insufficient organization permissions.' });
      req.membership = rows[0];
      next();
    } catch (err) { next(err); }
  };
}