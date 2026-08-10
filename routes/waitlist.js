'use strict';
const { Router } = require('express');
const { pool } = require('../db/pool');
const { auditLog } = require('../middleware/audit');
const router = Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT w.*, p.first_name, p.last_name, p.phone as patient_phone FROM waitlist w LEFT JOIN patients p ON w.patient_id = p.id ORDER BY w.created_at ASC`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { patient_id, patient_name, phone, email, desired_date, desired_time, provider, reason, urgency, notes } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO waitlist (patient_id, patient_name, phone, email, desired_date, desired_time, provider, reason, urgency, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [patient_id||null, patient_name||null, phone||null, email||null, desired_date||null, desired_time||null, provider||null, reason||null, urgency||'normal', notes||null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const notifiedAt = status === 'notified' ? new Date() : null;
    await pool.query('UPDATE waitlist SET status=$1, notified_at=COALESCE($2, notified_at) WHERE id=$3', [status, notifiedAt, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    if (req.session.staff.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
    await pool.query('DELETE FROM waitlist WHERE id = $1', [req.params.id]);
    await auditLog(req, 'DELETE', 'waitlist', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
