'use strict';
const { Router } = require('express');
const { pool } = require('../db/pool');
const { auditLog } = require('../middleware/audit');
const router = Router();

router.get('/by-patient/:patientId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.*, p.first_name, p.last_name FROM eob_records e LEFT JOIN patients p ON e.patient_id = p.id WHERE e.patient_id = $1 ORDER BY e.received_date DESC`,
      [req.params.patientId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/', async (req, res) => {
  try {
    const { patient_id } = req.query;
    let q, params;
    if (patient_id) {
      q = `SELECT e.*, p.first_name, p.last_name FROM eob_records e LEFT JOIN patients p ON e.patient_id = p.id WHERE e.patient_id = $1 ORDER BY e.received_date DESC`;
      params = [patient_id];
    } else {
      q = `SELECT e.*, p.first_name, p.last_name FROM eob_records e LEFT JOIN patients p ON e.patient_id = p.id ORDER BY e.received_date DESC LIMIT 200`;
      params = [];
    }
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { patient_id, patient_name, claim_id, payer_name, claim_number, service_date, billed_amount, allowed_amount, paid_amount, patient_resp, adjustment, denial_reason, received_date } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO eob_records (patient_id, patient_name, claim_id, payer_name, claim_number, service_date, billed_amount, allowed_amount, paid_amount, patient_resp, adjustment, denial_reason, received_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [patient_id||null, patient_name||null, claim_id||null, payer_name||null, claim_number||null, service_date||null, billed_amount||0, allowed_amount||0, paid_amount||0, patient_resp||0, adjustment||0, denial_reason||null, received_date||null]
    );
    await auditLog(req, 'CREATE', 'eob_record', rows[0].id);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { payer_name, billed_amount, allowed_amount, paid_amount, patient_resp, adjustment, denial_reason, status, received_date } = req.body;
    const { rows } = await pool.query(
      `UPDATE eob_records SET payer_name=$1, billed_amount=$2, allowed_amount=$3, paid_amount=$4, patient_resp=$5, adjustment=$6, denial_reason=$7, status=$8, received_date=$9 WHERE id=$10 RETURNING *`,
      [payer_name||null, billed_amount||0, allowed_amount||0, paid_amount||0, patient_resp||0, adjustment||0, denial_reason||null, status||'received', received_date||null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    await auditLog(req, 'UPDATE', 'eob_record', req.params.id);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    if (req.session.staff.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
    await pool.query('DELETE FROM eob_records WHERE id = $1', [req.params.id]);
    await auditLog(req, 'DELETE', 'eob_record', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
