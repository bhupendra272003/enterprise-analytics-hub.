import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db.js';
import { audit } from '../audit.js';
import { requireAuth, requireActiveUser, requireRole } from '../middleware.js';
const router = Router();
router.use(requireAuth, requireActiveUser);
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.execute("SELECT o.id, o.name, o.slug, m.role FROM organizations o JOIN memberships m ON m.organization_id = o.id WHERE m.user_id = ? AND m.membership_status = 'ACTIVE'", [req.user.id]);
    res.json({ organizations: rows });
  } catch (err) { next(err); }
});
router.post('/', async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(2).max(160), slug: z.string().trim().regex(/^[a-z0-9-]{3,180}$/) }).parse(req.body);
    const id = randomUUID();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('INSERT INTO organizations (id, name, slug, created_by) VALUES (?, ?, ?, ?)', [id, input.name, input.slug, req.user.id]);
      await conn.execute("INSERT INTO memberships (id, organization_id, user_id, role, membership_status) VALUES (?, ?, ?, 'OWNER', 'ACTIVE')", [randomUUID(), id, req.user.id]);
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    await audit({ orgId: id, actorId: req.user.id, action: 'ORGANIZATION_CREATED', targetType: 'ORGANIZATION', targetId: id, ip: req.ip });
    res.status(201).json({ organization: { id, ...input, role: 'OWNER' } });
  } catch (err) { next(err); }
});
router.post('/:orgId/approvals/:userId', requireRole('OWNER','ADMIN'), async (req, res, next) => {
  try {
    const parsed = z.object({ role: z.enum(['ADMIN','MANAGER','ANALYST','VIEWER']) }).parse(req.body);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [users] = await conn.execute("SELECT id FROM users WHERE id = ? AND account_status = 'PENDING' FOR UPDATE", [req.params.userId]);
      if (!users.length) { await conn.rollback(); return res.status(404).json({ error: 'Pending user not found.' }); }
      await conn.execute("UPDATE users SET account_status = 'ACTIVE' WHERE id = ?", [req.params.userId]);
      await conn.execute("INSERT INTO memberships (id, organization_id, user_id, role, membership_status) VALUES (?, ?, ?, ?, 'ACTIVE')", [randomUUID(), req.params.orgId, req.params.userId, parsed.data.role]);
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    await audit({ orgId: req.params.orgId, actorId: req.user.id, action: 'USER_APPROVED', targetType: 'USER', targetId: req.params.userId, metadata: { role: parsed.data.role }, ip: req.ip });
    res.json({ message: 'User approved and added to organization.' });
  } catch (err) { next(err); }
});
export default router;