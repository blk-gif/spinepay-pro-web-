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
    await pool.query('UPDATE time_clock SET approved = TRUE, approved_by = $1, approved_at = NOW() WHERE id = $2', [req.session.staff.full_name, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ADMIN ENDPOINTS ───────────────────────────────────────────────────────────

router.get('/admin/entries', async (req, res) => {
  try {
    if (req.session.staff.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
    const { startDate, endDate, staffId } = req.query;
    const s = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const e = endDate || new Date().toISOString().split('T')[0];
    let q, params;
    if (staffId) {
      q = `SELECT t.*, s.first_name, s.last_name, s.username FROM time_clock t LEFT JOIN staff s ON t.staff_id = s.id WHERE t.staff_id = $1 AND t.clock_in::date BETWEEN $2 AND $3 ORDER BY t.clock_in DESC`;
      params = [staffId, s, e];
    } else {
      q = `SELECT t.*, s.first_name, s.last_name, s.username FROM time_clock t LEFT JOIN staff s ON t.staff_id = s.id WHERE t.clock_in::date BETWEEN $1 AND $2 ORDER BY t.clock_in DESC`;
      params = [s, e];
    }
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/approve', async (req, res) => {
  try {
    if (req.session.staff.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
    const { rows } = await pool.query(
      `UPDATE time_clock SET approved = TRUE, approved_by = $1, approved_at = NOW() WHERE id = $2 RETURNING *`,
      [req.session.staff.full_name, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/edit', async (req, res) => {
  try {
    if (req.session.staff.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
    const { clock_in, clock_out, notes } = req.body;
    let total_hours = null;
    if (clock_in && clock_out) {
      total_hours = Math.round(((new Date(clock_out) - new Date(clock_in)) / 3600000) * 100) / 100;
    }
    const { rows } = await pool.query(
      `UPDATE time_clock SET clock_in = $1, clock_out = $2, total_hours = $3, notes = $4, approved = FALSE, approved_by = NULL, approved_at = NULL WHERE id = $5 RETURNING *`,
      [clock_in, clock_out || null, total_hours, notes || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/admin/payroll-summary', async (req, res) => {
  try {
    if (req.session.staff.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
    const { startDate, endDate } = req.query;
    const s = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const e = endDate || new Date().toISOString().split('T')[0];
    const { rows } = await pool.query(`
      SELECT
        s.id AS staff_id,
        s.first_name,
        s.last_name,
        s.username,
        COUNT(t.id) AS shifts,
        COALESCE(SUM(t.total_hours), 0) AS total_hours,
        COUNT(t.id) FILTER (WHERE t.approved = TRUE) AS approved_shifts,
        COUNT(t.id) FILTER (WHERE t.approved = FALSE OR t.approved IS NULL) AS pending_shifts
      FROM staff s
      LEFT JOIN time_clock t ON t.staff_id = s.id AND t.clock_in::date BETWEEN $1 AND $2
      WHERE s.active = TRUE
      GROUP BY s.id, s.first_name, s.last_name, s.username
      ORDER BY s.last_name, s.first_name
    `, [s, e]);
    res.json(rows.map(r => ({
      staff_id: r.staff_id,
      name: `${r.first_name} ${r.last_name}`,
      username: r.username,
      shifts: parseInt(r.shifts),
      total_hours: parseFloat(r.total_hours) || 0,
      approved_shifts: parseInt(r.approved_shifts),
      pending_shifts: parseInt(r.pending_shifts),
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
