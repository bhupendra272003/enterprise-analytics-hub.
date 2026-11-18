import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db.js';
import { audit } from '../audit.js';
import { requireAuth, requireActiveUser, requireRole } from '../middleware.js';
import { config } from '../config.js';
const router = Router();
router.post('/accept', requireAuth, async (req, res, next) => {
  try {
    const { token } = z.object({ token: z.string().min(32).max(256) }).parse(req.body);
    if (req.user.account_status === 'SUSPENDED') return res.status(403).json({ error: 'This account has been suspended.' });
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const conn = await pool.getConnection();
    let invitation;
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute("SELECT * FROM invitations WHERE token_hash = ? AND accepted_at IS NULL AND expires_at > NOW() FOR UPDATE", [tokenHash]);
      invitation = rows[0];
      if (!invitation || invitation.email.toLowerCase() !== req.user.email.toLowerCase()) { await conn.rollback(); return res.status(400).json({ error: 'Invitation is invalid or expired.' }); }
      await conn.execute("INSERT INTO memberships (id, organization_id, user_id, role, membership_status) VALUES (?, ?, ?, ?, 'ACTIVE') ON DUPLICATE KEY UPDATE role = VALUES(role), membership_status = 'ACTIVE'", [randomUUID(), invitation.organization_id, req.user.id, invitation.role]);
      await conn.execute("UPDATE users SET account_status = 'ACTIVE' WHERE id = ? AND account_status = 'PENDING'", [req.user.id]);
      await conn.execute('UPDATE invitations SET accepted_at = NOW() WHERE id = ?', [invitation.id]);
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    await audit({ orgId: invitation.organization_id, actorId: req.user.id, action: 'INVITATION_ACCEPTED', targetType: 'INVITATION', targetId: invitation.id, ip: req.ip });
    res.json({ message: 'Invitation accepted.' });
  } catch (err) { next(err); }
});
router.post('/organizations/:orgId/invitations', requireAuth, requireActiveUser, requireRole('OWNER','ADMIN'), async (req, res, next) => {
  try {
    const input = z.object({ email: z.string().email().transform(v => v.toLowerCase()), role: z.enum(['ADMIN','MANAGER','ANALYST','VIEWER']) }).parse(req.body);
    const token = randomBytes(32).toString('hex'), id = randomUUID();
    await pool.execute('INSERT INTO invitations (id, organization_id, email, role, token_hash, invited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))', [id, req.params.orgId, input.email, input.role, createHash('sha256').update(token).digest('hex'), req.user.id]);
    await audit({ orgId: req.params.orgId, actorId: req.user.id, action: 'INVITATION_CREATED', targetType: 'INVITATION', targetId: id, metadata: { email: input.email, role: input.role }, ip: req.ip });
    res.status(201).json({ message: 'Invitation created. Deliver this one-time token through a trusted channel.', invitationUrl: `${config.inviteBaseUrl}?token=${token}` });
  } catch (err) { next(err); }
});

router.post('/accept-signup', async (req, res, next) => {
  try {
    const input = z.object({
      token: z.string().min(32).max(256),
      fullName: z.string().trim().min(2).max(120),
      password: z.string().min(12).max(128)
    }).parse(req.body);
    const tokenHash = createHash('sha256').update(input.token).digest('hex');
    const [invites] = await pool.execute(
      "SELECT * FROM invitations WHERE token_hash = ? AND accepted_at IS NULL AND expires_at > NOW() LIMIT 1",
      [tokenHash]
    );
    const invitation = invites[0];
    if (!invitation) return res.status(400).json({ error: 'Invitation is invalid or expired.' });
    const conn = await pool.getConnection();
    const userId = randomUUID();
    try {
      await conn.beginTransaction();
      const [existing] = await conn.execute('SELECT id FROM users WHERE email = ? FOR UPDATE', [invitation.email.toLowerCase()]);
      if (existing.length) {
        await conn.rollback();
        return res.status(409).json({ error: 'An account already exists for this email. Sign in first, then accept the invitation.' });
      }
      const passwordHash = await bcrypt.hash(input.password, 12);
      await conn.execute("INSERT INTO users (id, full_name, email, password_hash, account_status) VALUES (?, ?, ?, ?, 'ACTIVE')", [userId, input.fullName, invitation.email.toLowerCase(), passwordHash]);
      await conn.execute("INSERT INTO memberships (id, organization_id, user_id, role, membership_status) VALUES (?, ?, ?, ?, 'ACTIVE')", [randomUUID(), invitation.organization_id, userId, invitation.role]);
      await conn.execute('UPDATE invitations SET accepted_at = NOW() WHERE id = ?', [invitation.id]);
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    await audit({ orgId: invitation.organization_id, actorId: userId, action: 'INVITATION_ACCEPTED_WITH_SIGNUP', targetType: 'INVITATION', targetId: invitation.id, ip: req.ip });
    req.session.regenerate(err => {
      if (err) return next(err);
      req.session.userId = userId;
      req.session.save(saveErr => {
        if (saveErr) return next(saveErr);
        res.status(201).json({ message: 'Account created and invitation accepted.' });
      });
    });
  } catch (err) { next(err); }
});

export default router;