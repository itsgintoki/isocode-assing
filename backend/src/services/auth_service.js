const crypto = require('crypto');
const db = require('../db/database');

const SESSION_COOKIE = 'shortlist_session';
const SESSION_DAYS = 7;
const DEMO_PASSWORD = 'demo1234';

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const [, salt, expected] = stored.split('$');
  if (!salt || !expected) return false;

  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseCookies(header = '') {
  return header.split(';').reduce((cookies, part) => {
    const index = part.indexOf('=');
    if (index === -1) return cookies;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function getRequestToken(req) {
  const authorization = req.headers.authorization || '';
  if (authorization.startsWith('Bearer ')) {
    return authorization.slice(7).trim();
  }
  return parseCookies(req.headers.cookie || '')[SESSION_COOKIE] || null;
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(hashToken(token), userId, expiresAt.toISOString());

  return { token, expiresAt };
}

function destroySession(token) {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(token));
}

function getUserForToken(token) {
  if (!token) return null;

  return db.prepare(`
    SELECT u.id, u.email, u.name, u.role, u.company_id, u.company_name
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND datetime(s.expires_at) > datetime('now')
  `).get(hashToken(token)) || null;
}

function publicUser(user) {
  if (!user) return null;
  const { password_hash, ...safeUser } = user;
  return safeUser;
}

function setSessionCookie(res, token, expiresAt) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    path: '/'
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  });
}

module.exports = {
  SESSION_COOKIE,
  DEMO_PASSWORD,
  hashPassword,
  verifyPassword,
  parseCookies,
  getRequestToken,
  createSession,
  destroySession,
  getUserForToken,
  publicUser,
  setSessionCookie,
  clearSessionCookie
};
