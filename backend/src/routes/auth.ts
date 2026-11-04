import express from 'express';
import db from '../db/database';
import { authMiddleware } from '../middleware/auth';
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  getRequestToken,
  publicUser,
  setSessionCookie,
  clearSessionCookie
} from '../services/auth_service';

const router = express.Router();

const loginAttempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 12;
// A throwaway hash keeps the failure path roughly constant-time when an email
// does not exist.
const dummyPasswordHash = hashPassword('not-a-real-password');

function isRateLimited(ip) {
  const record = loginAttempts.get(ip);
  if (!record) return false;
  if (Date.now() - record.startedAt > WINDOW_MS) {
    loginAttempts.delete(ip);
    return false;
  }
  return record.failures >= MAX_ATTEMPTS;
}

function recordFailedAttempt(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now - record.startedAt > WINDOW_MS) {
    loginAttempts.set(ip, { startedAt: now, failures: 1 });
    return;
  }
  record.failures += 1;
}

function clearAttempts(ip) {
  loginAttempts.delete(ip);
}

// Public list of seeded demo accounts. Passwords are intentionally not returned.
router.get('/demo-accounts', (req, res) => {
  const users = db.prepare(`
    SELECT id, email, name, role, company_name
    FROM users
    ORDER BY CASE role
      WHEN 'recruiter' THEN 1
      WHEN 'client_hiring_manager' THEN 2
      ELSE 3
    END, name
  `).all();

  res.json({ users });
});

router.post('/login', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many sign-in attempts. Please wait a few minutes and try again.' });
  }

  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(email);
  const passwordMatches = verifyPassword(password, user ? user.password_hash : dummyPasswordHash);
  if (!user || !passwordMatches) {
    recordFailedAttempt(ip);
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  clearAttempts(ip);
  db.prepare("DELETE FROM sessions WHERE datetime(expires_at) <= datetime('now')").run();
  const { token, expiresAt } = createSession(user.id);
  setSessionCookie(res, token, expiresAt);

  res.json({ user: publicUser(user) });
});

router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post('/logout', authMiddleware, (req, res) => {
  destroySession(getRequestToken(req));
  clearSessionCookie(res);
  res.json({ success: true });
});

export default router;
