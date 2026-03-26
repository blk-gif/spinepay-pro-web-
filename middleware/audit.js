'use strict';

const { pool } = require('../db/pool');

async function auditLog(req, action, resource, resourceId = null) {
  try {
    await pool.query(
      `INSERT INTO audit_log (staff_id, staff_name, action, resource, resource_id, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.session?.staff?.id ?? null,
        req.session?.staff?.full_name ?? 'system',
        action,
        resource,
        resourceId ? String(resourceId) : null,
        req.ip,
        req.get('user-agent') || null,
      ]
    );
  } catch (err) {
    console.error('[Audit] Failed to log:', err.message);
  }
}

module.exports = { auditLog };
