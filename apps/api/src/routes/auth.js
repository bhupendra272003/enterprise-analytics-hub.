import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db.js';
import { audit } from '../audit.js';
import { requireAuth, loadUser } from '../middleware.js';
const router = Router();
const registerSchema = z.object({ fullName: z.string().trim().min(2).max(120), email: z.string().trim().email().max(254).transform(v => v.toLowerCase()), password: z.string().min(12).max(128) });
router.post('/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [input.email]);
    if (existing.length) return res.status(409).json({ error: 'An account with this email already exists.' });
    const id = randomUUID(), hash = await bcrypt.hash(input.password, 12);
    await pool.execute("INSERT INTO users (id, full_name, email, password_hash, account_status) VALUES (?, ?, ?, ?, 'PENDING')", [id, input.fullName, input.email, hash]);
    await audit({ actorId: id, action: 'USER_REGISTERED', targetType: 'USER', targetId: id, ip: req.ip });
    res.status(201).json({ message: 'Registration received. Approval is required before access.', userId: id });
  } catch (err) { next(err); }
});
router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase(), password = String(req.body.password || '');
    const [rows] = await pool.execute('SELECT id, password_hash, account_status FROM users WHERE email = ? LIMIT 1', [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Invalid email or password.' });
    if (user.account_status === 'SUSPENDED') return res.status(403).json({ error: 'This account has been suspended.' });
    req.session.regenerate(err => {
      if (err) return next(err);
      req.session.userId = user.id;
      req.session.save(async saveErr => {
        if (saveErr) return next(saveErr);
        try { await audit({ actorId: user.id, action: 'USER_LOGIN', targetType: 'USER', targetId: user.id, ip: req.ip }); res.json({ message: 'Login successful.' }); }
        catch (e) { next(e); }
      });
    });
  } catch (err) { next(err); }
});
router.post('/logout', requireAuth, async (req, res, next) => {
  const userId = req.session.userId;
  try {
    await audit({ actorId: userId, action: 'USER_LOGOUT', targetType: 'USER', targetId: userId, ip: req.ip });
    req.session.destroy(err => { if (err) return next(err); res.clearCookie('hub.sid'); res.json({ message: 'Logged out.' }); });
  } catch (err) { next(err); }
});
router.get('/me', requireAuth, loadUser, async (req, res, next) => {
  try {
    const [memberships] = await pool.execute("SELECT o.id AS organizationId, o.name AS organizationName, m.role FROM memberships m JOIN organizations o ON o.id = m.organization_id WHERE m.user_id = ? AND m.membership_status = 'ACTIVE'", [req.user.id]);
    res.json({ user: { id: req.user.id, fullName: req.user.full_name, email: req.user.email, status: req.user.account_status }, organizations: memberships });
  } catch (err) { next(err); }
});
export default router;