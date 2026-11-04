import { getRequestToken, getUserForToken } from '../services/auth_service';

/**
 * Session-backed authentication. The browser sends an HttpOnly cookie;
 * API clients and the test suite can use `Authorization: Bearer <token>`.
 */
function authMiddleware(req, res, next) {
  const user = getUserForToken(getRequestToken(req));
  if (!user) {
    return res.status(401).json({ error: 'Please sign in to continue.' });
  }

  req.user = user;
  next();
}

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Please sign in to continue.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `You do not have access to this action. Required role: ${allowedRoles.join(' or ')}.`
      });
    }

    next();
  };
}

function canClientAccessRequisition(user, requisition) {
  if (!user || !requisition || user.role !== 'client_hiring_manager') return false;
  return requisition.client_company === user.company_name;
}

export {
  authMiddleware,
  requireRole,
  canClientAccessRequisition
};
