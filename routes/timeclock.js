'use strict';
const { Router } = require('express');
const { pool } = require('../db/pool');
const router = Router();

router.get('/users', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, username, role FROM staff WHERE active = TRUE ORDER BY last_name, first_name`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/entries', async (req, res) => {
  try {
    const { userId, startDate, endDate } = req.query;
    const s = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const e = endDate || new Date().toISOString().split('T')[0];
    let q, params;
    if (userId) {
      q = `SELECT t.*, s.first_name, s.last_name FROM time_clock t LEFT JOIN staff s ON t.staff_id = s.id WHERE t.staff_id = $1 AND t.clock_in::date BETWEEN $2 AND $3 ORDER BY t.clock_in DESC`;
      params = [userId, s, e];
    } else {
      q = `SELECT t.*, s.first_name, s.last_name FROM time_clock t LEFT JOIN staff s ON t.staff_id = s.id WHERE t.clock_in::date BETWEEN $1 AND $2 ORDER BY t.clock_in DESC`;
      params = [s, e];
    }
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/', async (req, res) => {
  try {
    const { start, end, staff_id } = req.query;
    const s = start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const e = end || new Date().toISOString().split('T')[0];
    let q, params;
    if (staff_id) {
      q = `SELECT t.*, s.first_name, s.last_name FROM time_clock t LEFT JOIN staff s ON t.staff_id = s.id WHERE t.staff_id = $1 AND t.clock_in::date BETWEEN $2 AND $3 ORDER BY t.clock_in DESC`;
      params = [staff_id, s, e];
    } else {
      q = `SELECT t.*, s.first_name, s.last_name FROM time_clock t LEFT JOIN staff s ON t.staff_id = s.id WHERE t.clock_in::date BETWEEN $1 AND $2 ORDER BY t.clock_in DESC`;
      params = [s, e];
    }
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/status/:staffId', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM time_clock WHERE staff_id = $1 AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1', [req.params.staffId]);
    res.json(rows[0] || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clock-in', async (req, res) => {
  try {
    const staffId = req.session.staff.id;
    const open = await pool.query('SELECT id FROM time_clock WHERE staff_id = $1 AND clock_out IS NULL', [staffId]);
    if (open.rows.length) return res.status(400).json({ error: 'Already clocked in' });
    const { rows } = await pool.query(
      `INSERT INTO time_clock (staff_id, staff_name) VALUES ($1, $2) RETURNING *`,
      [staffId, req.session.staff.full_name]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clock-out', async (req, res) => {
  try {
    const staffId = req.session.staff.id;
    const { rows: open } = await pool.query('SELECT id, clock_in FROM time_clock WHERE staff_id = $1 AND clock_out IS NULL', [staffId]);
    if (!open.length) return res.status(400).json({ error: 'Not clocked in' });
    const hours = (Date.now() - new Date(open[0].clock_in).getTime()) / 3600000;
    await pool.query('UPDATE time_clock SET clock_out = NOW(), total_hours = $1 WHERE id = $2', [Math.round(hours * 100) / 100, open[0].id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/approve', async (req, res) => {
  try {
    if (req.session.staff.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
    await pool.query('UPDATE time_clock SET approved = TRUE, approved_by = $1 WHERE id = $2', [req.session.staff.full_name, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
