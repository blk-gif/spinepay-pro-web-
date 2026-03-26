'use strict';
const { Router } = require('express');
const { pool } = require('../db/pool');
const { auditLog } = require('../middleware/audit');
const router = Router();

router.get('/', async (req, res) => {
  try {
    const { patient_id } = req.query;
    const q = patient_id
      ? `SELECT * FROM pi_cases WHERE patient_id = $1 ORDER BY created_at DESC`
      : `SELECT pi.*, p.first_name, p.last_name FROM pi_cases pi LEFT JOIN patients p ON pi.patient_id = p.id ORDER BY pi.created_at DESC LIMIT 200`;
    const { rows } = await pool.query(q, patient_id ? [patient_id] : []);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { patient_id, patient_name, date_of_accident, accident_type, accident_description, attorney_name, attorney_firm, attorney_phone, attorney_email, insurance_company, claim_number, adjuster_name, adjuster_phone, policy_limit, lien_amount } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO pi_cases (patient_id, patient_name, date_of_accident, accident_type, accident_description, attorney_name, attorney_firm, attorney_phone, attorney_email, insurance_company, claim_number, adjuster_name, adjuster_phone, policy_limit, lien_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [patient_id||null, patient_name||null, date_of_accident||null, accident_type||null, accident_description||null, attorney_name||null, attorney_firm||null, attorney_phone||null, attorney_email||null, insurance_company||null, claim_number||null, adjuster_name||null, adjuster_phone||null, policy_limit||0, lien_amount||0]
    );
    await auditLog(req, 'CREATE', 'pi_case', rows[0].id);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { attorney_name, attorney_firm, attorney_phone, attorney_email, insurance_company, claim_number, adjuster_name, adjuster_phone, policy_limit, lien_amount, settlement_amount, case_status, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE pi_cases SET attorney_name=$1, attorney_firm=$2, attorney_phone=$3, attorney_email=$4, insurance_company=$5, claim_number=$6, adjuster_name=$7, adjuster_phone=$8, policy_limit=$9, lien_amount=$10, settlement_amount=$11, case_status=$12, notes=$13, updated_at=NOW() WHERE id=$14 RETURNING *`,
      [attorney_name||null, attorney_firm||null, attorney_phone||null, attorney_email||null, insurance_company||null, claim_number||null, adjuster_name||null, adjuster_phone||null, policy_limit||0, lien_amount||0, settlement_amount||0, case_status||'open', notes||null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    await auditLog(req, 'UPDATE', 'pi_case', req.params.id);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    if (req.session.staff.role !== 'Admin') return res.status(403).json({ error: 'Admin required' });
    await pool.query('DELETE FROM pi_cases WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
