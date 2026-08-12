'use strict';
const { Router } = require('express');
const { pool } = require('../db/pool');
const { sendReminderForAppointment } = require('../services/reminders');
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
      [name, 'email', trigger_hours||24, subject||null, body, active !== false]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/templates/:id', async (req, res) => {
  try {
    const { name, type, trigger_hours, subject, body, active } = req.body;
    const { rows } = await pool.query(
      `UPDATE reminder_templates SET name=$1, type=$2, trigger_hours=$3, subject=$4, body=$5, active=$6, updated_at=NOW() WHERE id=$7 RETURNING *`,
      [name, 'email', trigger_hours||24, subject||null, body, active !== false, req.params.id]
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
    const result = await sendReminderForAppointment(appointment_id, template_id);
    if (result.notFound) return res.status(404).json({ error: result.error });
    if (!result.success)  return res.status(result.noEmail ? 400 : 502).json(result);
    return res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
