'use strict';
const { Router } = require('express');
const { pool } = require('../db/pool');
const { auditLog } = require('../middleware/audit');
const { logActivity } = require('../services/activityLog');
const router = Router();

function fmtClaimSummary(patientName, billedAmount) {
  const name = patientName || 'Unknown';
  const amt = '$' + (parseFloat(billedAmount) || 0).toFixed(2);
  return `${name} — ${amt}`;
}

router.get('/by-patient/:patientId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, p.first_name, p.last_name FROM billing_claims c LEFT JOIN patients p ON c.patient_id = p.id WHERE c.patient_id = $1 ORDER BY c.created_at DESC`,
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
      q = `SELECT c.*, p.first_name, p.last_name FROM billing_claims c LEFT JOIN patients p ON c.patient_id = p.id WHERE c.patient_id = $1 ORDER BY c.created_at DESC`;
      params = [patient_id];
    } else {
      q = `SELECT c.*, p.first_name, p.last_name FROM billing_claims c LEFT JOIN patients p ON c.patient_id = p.id ORDER BY c.created_at DESC LIMIT 200`;
      params = [];
    }
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { patient_id, patient_name, insurance_name, claim_number, service_date, submitted_date, cpt_codes, icd_codes, billed_amount, notes } = req.body;
    const claimNum = claim_number || `CLM-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const { rows } = await pool.query(
      `INSERT INTO billing_claims (patient_id, patient_name, insurance_name, claim_number, service_date, submitted_date, cpt_codes, icd_codes, billed_amount, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [patient_id||null, patient_name||null, insurance_name||null, claimNum, service_date||null, submitted_date||null, cpt_codes||null, icd_codes||null, billed_amount||0, notes||null]
    );
    await auditLog(req, 'CREATE', 'billing_claim', rows[0].id);
    await logActivity(req, 'created', 'billing_claim', rows[0].id, fmtClaimSummary(rows[0].patient_name, rows[0].billed_amount));
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { patient_id, patient_name, insurance_name, service_date, submitted_date, cpt_codes, icd_codes, billed_amount, paid_amount, status, denial_reason, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE billing_claims SET patient_id=COALESCE($1,patient_id), patient_name=COALESCE($2,patient_name), insurance_name=$3, service_date=$4, submitted_date=$5, cpt_codes=$6, icd_codes=$7,
       billed_amount=$8, paid_amount=$9, status=$10, denial_reason=$11, notes=$12, updated_at=NOW()
       WHERE id=$13 RETURNING *`,
      [patient_id||null, patient_name||null, insurance_name||null, service_date||null, submitted_date||null, cpt_codes||null, icd_codes||null, billed_amount||0, paid_amount||0, status||'pending', denial_reason||null, notes||null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    await auditLog(req, 'UPDATE', 'billing_claim', req.params.id);
    await logActivity(req, 'edited', 'billing_claim', rows[0].id, fmtClaimSummary(rows[0].patient_name, rows[0].billed_amount));
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { status, denial_reason } = req.body;
    // Pre-fetch for activity log summary (query unchanged)
    const pre = await pool.query('SELECT patient_name, billed_amount FROM billing_claims WHERE id = $1', [req.params.id]);
    await pool.query('UPDATE billing_claims SET status=$1, denial_reason=$2, updated_at=NOW() WHERE id=$3', [status, denial_reason||null, req.params.id]);
    await auditLog(req, 'UPDATE', 'billing_claim', req.params.id);
    const r = pre.rows[0];
    await logActivity(req, 'edited', 'billing_claim', req.params.id,
      r ? `${r.patient_name || 'Unknown'} — status → ${status}` : `Claim #${req.params.id} — status → ${status}`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    if (req.session.staff.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
    // Pre-fetch for activity log summary before deletion
    const pre = await pool.query('SELECT patient_name, billed_amount FROM billing_claims WHERE id = $1', [req.params.id]);
    const r = pre.rows[0];
    const deleteSummary = r ? fmtClaimSummary(r.patient_name, r.billed_amount) : `Claim #${req.params.id}`;
    await pool.query('DELETE FROM billing_claims WHERE id = $1', [req.params.id]);
    await auditLog(req, 'DELETE', 'billing_claim', req.params.id);
    await logActivity(req, 'deleted', 'billing_claim', req.params.id, deleteSummary);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
