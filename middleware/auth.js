'use strict';

function requireAuth(req, res, next) {
  if (!req.session?.staff) {
    return res.status(401).json({ error: 'Authentication required', redirect: '/login' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.staff) {
    return res.status(401).json({ error: 'Authentication required', redirect: '/login' });
  }
  if (req.session.staff.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
