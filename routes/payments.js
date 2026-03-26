'use strict';
const { Router } = require('express');
const { pool } = require('../db/pool');
const { auditLog } = require('../middleware/audit');
const router = Router();

router.get('/by-patient/:patientId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT pay.*, p.first_name, p.last_name FROM payments pay LEFT JOIN patients p ON pay.patient_id = p.id WHERE pay.patient_id = $1 ORDER BY pay.date DESC`,
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
      q = `SELECT pay.*, p.first_name, p.last_name FROM payments pay LEFT JOIN patients p ON pay.patient_id = p.id WHERE pay.patient_id = $1 ORDER BY pay.date DESC`;
      params = [patient_id];
    } else {
      q = `SELECT pay.*, p.first_name, p.last_name FROM payments pay LEFT JOIN patients p ON pay.patient_id = p.id ORDER BY pay.date DESC LIMIT 200`;
      params = [];
    }
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { patient_id, claim_id, amount, method, reference, date, notes } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO payments (patient_id, claim_id, amount, method, reference, date, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [patient_id||null, claim_id||null, amount, method||null, reference||null, date||new Date().toISOString().split('T')[0], notes||null]
    );
    if (claim_id) {
      await pool.query('UPDATE billing_claims SET paid_amount = paid_amount + $1, updated_at = NOW() WHERE id = $2', [amount, claim_id]);
      const { rows: cr } = await pool.query('SELECT billed_amount, paid_amount FROM billing_claims WHERE id = $1', [claim_id]);
      if (cr[0]) {
        const newStatus = parseFloat(cr[0].paid_amount) >= parseFloat(cr[0].billed_amount) ? 'paid' : 'partial';
        await pool.query('UPDATE billing_claims SET status = $1 WHERE id = $2', [newStatus, claim_id]);
      }
    }
    await auditLog(req, 'CREATE', 'payment', rows[0].id);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
