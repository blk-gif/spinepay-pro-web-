'use strict';
const { Router } = require('express');
const { pool } = require('../db/pool');
const { auditLog } = require('../middleware/audit');
const router = Router();

router.get('/by-patient/:patientId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM referrals WHERE patient_id = $1 ORDER BY created_at DESC`,
      [req.params.patientId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/', async (req, res) => {
  try {
    const { patient_id } = req.query;
    const q = patient_id
      ? `SELECT * FROM referrals WHERE patient_id = $1 ORDER BY created_at DESC`
      : `SELECT r.*, p.first_name, p.last_name FROM referrals r LEFT JOIN patients p ON r.patient_id = p.id ORDER BY r.created_at DESC LIMIT 200`;
    const { rows } = await pool.query(q, patient_id ? [patient_id] : []);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { patient_id, patient_name, type, recipient_name, recipient_email, recipient_phone, reason, notes } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO referrals (patient_id, patient_name, type, recipient_name, recipient_email, recipient_phone, reason, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [patient_id||null, patient_name||null, type||null, recipient_name||null, recipient_email||null, recipient_phone||null, reason||null, notes||null]
    );
    await auditLog(req, 'CREATE', 'referral', rows[0].id);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const sent_date = status === 'sent' ? new Date().toISOString().split('T')[0] : null;
    await pool.query('UPDATE referrals SET status=$1, sent_date=COALESCE($2::date, sent_date) WHERE id=$3', [status, sent_date, req.params.id]);
    await auditLog(req, 'UPDATE', 'referral', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    if (req.session.staff.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
    await pool.query('DELETE FROM referrals WHERE id = $1', [req.params.id]);
    await auditLog(req, 'DELETE', 'referral', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
