'use strict';
const { Router } = require('express');
const { pool } = require('../db/pool');
const { auditLog } = require('../middleware/audit');
const { logActivity } = require('../services/activityLog');
const router = Router();

function fmtTransportSummary(patientName, pickupTime) {
  const name = patientName || 'Unknown';
  if (!pickupTime) return name;
  const d = new Date(pickupTime);
  const timeStr = isNaN(d) ? String(pickupTime) : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  return `${name} — pickup: ${timeStr}`;
}

router.get('/by-patient/:patientId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.*, p.first_name, p.last_name, p.phone FROM transportation t LEFT JOIN patients p ON t.patient_id = p.id WHERE t.patient_id = $1 ORDER BY t.created_at DESC`,
      [req.params.patientId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/', async (req, res) => {
  try {
    const { patient_id } = req.query;
    const q = patient_id
      ? `SELECT * FROM transportation WHERE patient_id = $1 ORDER BY created_at DESC`
      : `SELECT t.*, p.first_name, p.last_name, p.phone, a.date, a.time FROM transportation t LEFT JOIN patients p ON t.patient_id = p.id LEFT JOIN appointments a ON t.appointment_id = a.id ORDER BY a.date DESC NULLS LAST, t.created_at DESC LIMIT 200`;
    const { rows } = await pool.query(q, patient_id ? [patient_id] : []);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { patient_id, appointment_id, patient_name, pickup_address, pickup_time, dropoff_address, driver_name, driver_notes } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO transportation (patient_id, appointment_id, patient_name, pickup_address, pickup_time, dropoff_address, driver_name, driver_notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [patient_id||null, appointment_id||null, patient_name||null, pickup_address||null, pickup_time||null, dropoff_address||null, driver_name||null, driver_notes||null]
    );
    await auditLog(req, 'CREATE', 'transportation', rows[0].id);
    await logActivity(req, 'created', 'transportation', rows[0].id, fmtTransportSummary(rows[0].patient_name, rows[0].pickup_time));
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { pickup_address, pickup_time, dropoff_address, driver_name, driver_notes, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE transportation SET pickup_address=$1, pickup_time=$2, dropoff_address=$3, driver_name=$4, driver_notes=$5, status=$6 WHERE id=$7 RETURNING *`,
      [pickup_address||null, pickup_time||null, dropoff_address||null, driver_name||null, driver_notes||null, status||'requested', req.params.id]
    );
    await auditLog(req, 'UPDATE', 'transportation', req.params.id);
    await logActivity(req, 'edited', 'transportation', rows[0].id, fmtTransportSummary(rows[0].patient_name, rows[0].pickup_time));
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    if (req.session.staff.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
    const pre = await pool.query('SELECT patient_name, pickup_time FROM transportation WHERE id = $1', [req.params.id]);
    const r = pre.rows[0];
    const deleteSummary = r ? fmtTransportSummary(r.patient_name, r.pickup_time) : `Transportation #${req.params.id}`;
    await pool.query('DELETE FROM transportation WHERE id = $1', [req.params.id]);
    await auditLog(req, 'DELETE', 'transportation', req.params.id);
    await logActivity(req, 'deleted', 'transportation', req.params.id, deleteSummary);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
