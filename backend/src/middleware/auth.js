const db = require('../db/database');

/**
 * Authentication and Role-Based Access Control Middleware
 * Supports seamless switching for evaluation and review
 */

function authMiddleware(req, res, next) {
  // Read user from header x-user-id or default to recruiter Priya
  const userId = req.headers['x-user-id'] || 'usr_recruiter_priya';
  
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(401).json({ error: 'User not authenticated or invalid user ID' });
  }

  req.user = user;
  next();
}

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: Access restricted to roles [${allowedRoles.join(', ')}]. Current role: ${req.user.role}`
      });
    }

    next();
  };
}

module.exports = {
  authMiddleware,
  requireRole
};
