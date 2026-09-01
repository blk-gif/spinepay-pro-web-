'use strict';
const { Router } = require('express');
const { pool } = require('../db/pool');
const { auditLog } = require('../middleware/audit');
const { logActivity } = require('../services/activityLog');
const router = Router();

function fmtWaitlistSummary(patientName, desiredDate) {
  const name = patientName || 'Unknown';
  if (!desiredDate) return name;
  const d = new Date(desiredDate);
  const dateStr = isNaN(d) ? String(desiredDate) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${name} — desired: ${dateStr}`;
}

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
    await auditLog(req, 'CREATE', 'waitlist', rows[0].id);
    await logActivity(req, 'created', 'waitlist', rows[0].id, fmtWaitlistSummary(rows[0].patient_name, rows[0].desired_date));
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const pre = await pool.query('SELECT patient_name, desired_date FROM waitlist WHERE id = $1', [req.params.id]);
    const r = pre.rows[0];
    const notifiedAt = status === 'notified' ? new Date() : null;
    await pool.query('UPDATE waitlist SET status=$1, notified_at=COALESCE($2, notified_at) WHERE id=$3', [status, notifiedAt, req.params.id]);
    await auditLog(req, 'UPDATE', 'waitlist', req.params.id);
    await logActivity(req, 'edited', 'waitlist', req.params.id,
      r ? `${fmtWaitlistSummary(r.patient_name, r.desired_date)} — status → ${status}` : `Waitlist #${req.params.id} — status → ${status}`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    if (req.session.staff.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
    const pre = await pool.query('SELECT patient_name, desired_date FROM waitlist WHERE id = $1', [req.params.id]);
    const r = pre.rows[0];
    const deleteSummary = r ? fmtWaitlistSummary(r.patient_name, r.desired_date) : `Waitlist #${req.params.id}`;
    await pool.query('DELETE FROM waitlist WHERE id = $1', [req.params.id]);
    await auditLog(req, 'DELETE', 'waitlist', req.params.id);
    await logActivity(req, 'deleted', 'waitlist', req.params.id, deleteSummary);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
