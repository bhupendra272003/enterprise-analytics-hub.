import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db.js';
import { audit } from '../audit.js';
import { requireAuth, requireActiveUser, requireRole } from '../middleware.js';
import { notifyUser, notifyOrganizationRoles } from './notifications.js';

const router = Router();

// Public directory exposes only basic workspace identity, never member data.
router.get('/directory', async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT id, name, slug FROM organizations ORDER BY name ASC LIMIT 200');
    res.json({ organizations: rows });
  } catch (err) { next(err); }
});

// Pending users may submit an organization-specific access request.
router.post('/:orgId/request-access', requireAuth, async (req, res, next) => {
  try {
    if (!req.user || req.user.account_status === 'SUSPENDED') {
      return res.status(403).json({ error: 'This account cannot request access.' });
    }
    if (!req.user.email_verified_at) return res.status(403).json({ error: 'Verify your email before requesting organization access.' });
    const [orgs] = await pool.execute('SELECT id FROM organizations WHERE id = ? LIMIT 1', [req.params.orgId]);
    if (!orgs.length) return res.status(404).json({ error: 'Organization not found.' });
    const [memberRows] = await pool.execute("SELECT id FROM memberships WHERE organization_id = ? AND user_id = ? AND membership_status = 'ACTIVE' LIMIT 1", [req.params.orgId, req.user.id]);
    if (memberRows.length) return res.status(409).json({ error: 'You are already an active member of this organization.' });
    const conn = await pool.getConnection();
    const requestId = randomUUID();
    try {
      await conn.beginTransaction();
      await conn.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [req.user.id]);
      const [existing] = await conn.execute(
        "SELECT id FROM organization_access_requests WHERE organization_id = ? AND user_id = ? AND status = 'PENDING' LIMIT 1 FOR UPDATE",
        [req.params.orgId, req.user.id]
      );
      if (existing.length) { await conn.rollback(); return res.status(409).json({ error: 'Your access request is already pending.' }); }
      await conn.execute("INSERT INTO organization_access_requests (id, organization_id, user_id, status) VALUES (?, ?, ?, 'PENDING')", [requestId, req.params.orgId, req.user.id]);
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    await audit({ orgId: req.params.orgId, actorId: req.user.id, action: 'ACCESS_REQUEST_SUBMITTED', targetType: 'ACCESS_REQUEST', targetId: requestId, ip: req.ip });
    await notifyOrganizationRoles({ organizationId: req.params.orgId, roles: ['OWNER', 'ADMIN'], type: 'ACCESS_REQUEST', title: 'New access request', message: 'A user requested to join your organization.', href: '/workspace/team' });
    res.status(201).json({ message: 'Access request submitted. An organization administrator can now review it.' });
  } catch (err) { next(err); }
});

router.use(requireAuth, requireActiveUser);

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      "SELECT o.id, o.name, o.slug, m.role FROM organizations o JOIN memberships m ON m.organization_id = o.id WHERE m.user_id = ? AND m.membership_status = 'ACTIVE'",
      [req.user.id]
    );
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

router.get('/:orgId/audit', requireRole('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const [rows] = await pool.execute(
      'SELECT a.id, a.action, a.target_type AS targetType, a.target_id AS targetId, a.metadata, a.ip_address AS ipAddress, a.created_at AS createdAt, u.full_name AS actorName, u.email AS actorEmail FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id WHERE a.organization_id = ? ORDER BY a.created_at DESC LIMIT ?',
      [req.params.orgId, limit]
    );
    res.json({ events: rows });
  } catch (err) { next(err); }
});

router.get('/:orgId/members', requireRole('OWNER', 'ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      "SELECT u.id, u.full_name AS fullName, u.email, u.account_status AS accountStatus, m.role, m.membership_status AS membershipStatus, m.created_at AS joinedAt FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.organization_id = ? ORDER BY m.created_at DESC",
      [req.params.orgId]
    );
    res.json({ members: rows });
  } catch (err) { next(err); }
});


router.patch('/:orgId/members/:userId', requireRole('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    if (req.params.userId === req.user.id) return res.status(400).json({ error: 'You cannot change your own membership here.' });
    const input = z.object({
      role: z.enum(['ADMIN', 'MANAGER', 'ANALYST', 'VIEWER']).optional(),
      membershipStatus: z.enum(['ACTIVE', 'SUSPENDED']).optional()
    }).refine(v => Object.keys(v).length > 0).parse(req.body);
    const [rows] = await pool.execute(
      'SELECT role, membership_status FROM memberships WHERE organization_id = ? AND user_id = ? LIMIT 1',
      [req.params.orgId, req.params.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Organization member not found.' });
    if (rows[0].role === 'OWNER') return res.status(403).json({ error: 'The organization owner cannot be modified here.' });
    if (req.membership.role === 'ADMIN' && (rows[0].role === 'ADMIN' || input.role === 'ADMIN')) return res.status(403).json({ error: 'Only the owner can manage administrator roles.' });
    await pool.execute(
      'UPDATE memberships SET role = COALESCE(?, role), membership_status = COALESCE(?, membership_status) WHERE organization_id = ? AND user_id = ?',
      [input.role || null, input.membershipStatus || null, req.params.orgId, req.params.userId]
    );
    await audit({ orgId: req.params.orgId, actorId: req.user.id, action: 'MEMBERSHIP_UPDATED', targetType: 'MEMBERSHIP', targetId: req.params.userId, metadata: input, ip: req.ip });
    await notifyUser({ userId: req.params.userId, organizationId: req.params.orgId, type: 'MEMBERSHIP_UPDATED', title: 'Your workspace access changed', message: 'Your organization role or membership status was updated.', href: '/workspace' });
    res.json({ message: 'Member access updated.' });
  } catch (err) { next(err); }
});

router.get('/:orgId/requests', requireRole('OWNER', 'ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      "SELECT r.id, r.status, r.created_at AS requestedAt, u.id AS userId, u.full_name AS fullName, u.email FROM organization_access_requests r JOIN users u ON u.id = r.user_id WHERE r.organization_id = ? AND r.status = 'PENDING' ORDER BY r.created_at ASC",
      [req.params.orgId]
    );
    res.json({ requests: rows });
  } catch (err) { next(err); }
});

router.patch('/:orgId/requests/:requestId', requireRole('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const input = z.object({ decision: z.enum(['APPROVE', 'REJECT']), role: z.enum(['MANAGER', 'ANALYST', 'VIEWER']).optional() }).parse(req.body);
    if (input.decision === 'APPROVE' && !input.role) return res.status(400).json({ error: 'Choose a role before approving this request.' });
    const conn = await pool.getConnection();
    let request;
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute(
        "SELECT r.id, r.user_id, r.organization_id, r.status FROM organization_access_requests r WHERE r.id = ? AND r.organization_id = ? FOR UPDATE",
        [req.params.requestId, req.params.orgId]
      );
      request = rows[0];
      if (!request || request.status !== 'PENDING') {
        await conn.rollback();
        return res.status(404).json({ error: 'Pending access request not found.' });
      }
      if (input.decision === 'APPROVE') {
        await conn.execute(
          "INSERT INTO memberships (id, organization_id, user_id, role, membership_status) VALUES (?, ?, ?, ?, 'ACTIVE') ON DUPLICATE KEY UPDATE role = VALUES(role), membership_status = 'ACTIVE'",
          [randomUUID(), request.organization_id, request.user_id, input.role]
        );
        await conn.execute("UPDATE users SET account_status = 'ACTIVE' WHERE id = ? AND account_status = 'PENDING'", [request.user_id]);
      }
      await conn.execute(
        'UPDATE organization_access_requests SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
        [input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', req.user.id, request.id]
      );
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    await audit({ orgId: req.params.orgId, actorId: req.user.id, action: input.decision === 'APPROVE' ? 'ACCESS_REQUEST_APPROVED' : 'ACCESS_REQUEST_REJECTED', targetType: 'ACCESS_REQUEST', targetId: request.id, metadata: input.decision === 'APPROVE' ? { role: input.role } : {}, ip: req.ip });
    await notifyUser({ userId: request.user_id, organizationId: req.params.orgId, type: 'ACCESS_REVIEW', title: input.decision === 'APPROVE' ? 'Access approved' : 'Access request declined', message: input.decision === 'APPROVE' ? 'Your organization access is now active.' : 'Your organization access request was not approved.', href: '/workspace' });
    res.json({ message: input.decision === 'APPROVE' ? 'Access request approved.' : 'Access request rejected.' });
  } catch (err) { next(err); }
});

export default router;
