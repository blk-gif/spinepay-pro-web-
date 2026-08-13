'use strict';

const { Router } = require('express');
const { pool } = require('../db/pool');

const router = Router();

// GET /api/activity-log
// Query params: actor (username), record_type, date_from (YYYY-MM-DD), date_to (YYYY-MM-DD)
router.get('/', async (req, res) => {
  try {
    const { actor, record_type, date_from, date_to } = req.query;

    let where = [];
    let params = [];
    let idx = 1;

    if (actor) {
      where.push(`actor_username = $${idx++}`);
      params.push(actor);
    }
    if (record_type) {
      where.push(`record_type = $${idx++}`);
      params.push(record_type);
    }
    if (date_from) {
      where.push(`created_at >= $${idx++}`);
      params.push(date_from);
    }
    if (date_to) {
      // include the full day_to by going to start of next day
      where.push(`created_at < ($${idx++}::date + INTERVAL '1 day')`);
      params.push(date_to);
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await pool.query(
      `SELECT id, actor_username, actor_role, action, record_type, record_id, record_summary, created_at
         FROM activity_log
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT 500`,
      params
    );

    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/activity-log/actors — distinct actor usernames for the filter dropdown
router.get('/actors', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT actor_username FROM activity_log ORDER BY actor_username`
    );
    res.json(rows.map(r => r.actor_username));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
