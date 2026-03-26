'use strict';
const { Router } = require('express');
const { pool } = require('../db/pool');
const { auditLog } = require('../middleware/audit');
const router = Router();

router.get('/by-patient/:patientId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.*, p.first_name, p.last_name FROM intake_forms f LEFT JOIN patients p ON f.patient_id = p.id WHERE f.patient_id = $1 ORDER BY f.submitted_at DESC`,
      [req.params.patientId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/', async (req, res) => {
  try {
    const { patient_id } = req.query;
    const q = patient_id
      ? `SELECT f.*, p.first_name, p.last_name FROM intake_forms f LEFT JOIN patients p ON f.patient_id = p.id WHERE f.patient_id = $1 ORDER BY f.submitted_at DESC`
      : `SELECT f.*, p.first_name, p.last_name FROM intake_forms f LEFT JOIN patients p ON f.patient_id = p.id ORDER BY f.submitted_at DESC LIMIT 200`;
    const { rows } = await pool.query(q, patient_id ? [patient_id] : []);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT f.*, p.first_name, p.last_name FROM intake_forms f LEFT JOIN patients p ON f.patient_id = p.id WHERE f.id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    await auditLog(req, 'READ', 'intake_form', req.params.id);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { patient_id, full_name, dob, gender, address, phone, email, insurance_provider, policy_number, group_number, medical_history, current_medications, allergies, reason_for_visit, pain_scale, hipaa_acknowledged, signature, signature_date } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO intake_forms (patient_id, full_name, dob, gender, address, phone, email, insurance_provider, policy_number, group_number, medical_history, current_medications, allergies, reason_for_visit, pain_scale, hipaa_acknowledged, signature, signature_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [patient_id||null, full_name||null, dob||null, gender||null, address||null, phone||null, email||null, insurance_provider||null, policy_number||null, group_number||null, medical_history||null, current_medications||null, allergies||null, reason_for_visit||null, pain_scale||null, hipaa_acknowledged||false, signature||null, signature_date||null]
    );
    await auditLog(req, 'CREATE', 'intake_form', rows[0].id);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
