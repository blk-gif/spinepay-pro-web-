'use strict';

const { pool } = require('../db/pool');

/**
 * Log a create/edit/delete action to the activity_log table.
 *
 * @param {object} req           - Express request (for session actor info)
 * @param {string} action        - 'created' | 'edited' | 'deleted'
 * @param {string} recordType    - e.g. 'patient', 'appointment', 'billing_claim'
 * @param {string|number} recordId
 * @param {string} summary       - Human-readable label, e.g. "Jane Smith"
 */
async function logActivity(req, action, recordType, recordId, summary) {
  try {
    const actor = req.session?.staff;
    await pool.query(
      `INSERT INTO activity_log (actor_username, actor_role, action, record_type, record_id, record_summary)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        actor?.username  ?? 'system',
        actor?.role      ?? 'system',
        action,
        recordType,
        recordId != null ? String(recordId) : null,
        summary  ?? null,
      ]
    );
  } catch (err) {
    // Never let activity logging crash a route
    console.error('[ActivityLog] Failed to log:', err.message);
  }
}

module.exports = { logActivity };
