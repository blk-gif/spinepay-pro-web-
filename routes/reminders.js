'use strict';
const { Router } = require('express');
const { pool } = require('../db/pool');
const router = Router();

router.get('/templates', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM reminder_templates ORDER BY type, trigger_hours');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/templates', async (req, res) => {
  try {
    const { name, type, trigger_hours, subject, body, active } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO reminder_templates (name, type, trigger_hours, subject, body, active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, type||'sms', trigger_hours||24, subject||null, body, active !== false]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/templates/:id', async (req, res) => {
  try {
    const { name, type, trigger_hours, subject, body, active } = req.body;
    const { rows } = await pool.query(
      `UPDATE reminder_templates SET name=$1, type=$2, trigger_hours=$3, subject=$4, body=$5, active=$6, updated_at=NOW() WHERE id=$7 RETURNING *`,
      [name, type||'sms', trigger_hours||24, subject||null, body, active !== false, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/templates/:id', async (req, res) => {
  try {
    if (req.session.staff.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
    await pool.query('DELETE FROM reminder_templates WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/log', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT l.*, p.first_name || ' ' || p.last_name AS patient_name FROM reminder_log l LEFT JOIN patients p ON l.patient_id = p.id ORDER BY l.sent_at DESC LIMIT 200`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/send', async (req, res) => {
  try {
    const { appointment_id, template_id } = req.body;
    const { rows: appts } = await pool.query(
      `SELECT a.*, p.first_name, p.last_name, p.phone, p.email FROM appointments a LEFT JOIN patients p ON a.patient_id = p.id WHERE a.id = $1`, [appointment_id]
    );
    const { rows: tmpl } = await pool.query('SELECT * FROM reminder_templates WHERE id = $1', [template_id]);
    if (!appts[0] || !tmpl[0]) return res.status(404).json({ error: 'Appointment or template not found' });
    const appt = appts[0], t = tmpl[0];
    const msg = t.body
      .replace(/\{\{patient_name\}\}/g, `${appt.first_name} ${appt.last_name}`)
      .replace(/\{\{date\}\}/g, appt.date)
      .replace(/\{\{time\}\}/g, appt.time);
    const recipient = t.type === 'sms' ? appt.phone : appt.email;
    await pool.query(
      `INSERT INTO reminder_log (appointment_id, patient_id, template_id, type, recipient, message, status) VALUES ($1,$2,$3,$4,$5,$6,'sent')`,
      [appointment_id, appt.patient_id, template_id, t.type, recipient, msg]
    );
    res.json({ success: true, message: msg, recipient });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
