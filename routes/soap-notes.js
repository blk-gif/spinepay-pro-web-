'use strict';

const { Router } = require('express');
const { pool } = require('../db/pool');
const { auditLog } = require('../middleware/audit');
const { logActivity } = require('../services/activityLog');

const router = Router();

function fmtSoapSummary(patientName, noteDate) {
  const name = patientName || 'Unknown';
  if (!noteDate) return `${name} — SOAP Note`;
  const d = new Date(noteDate);
  const dateStr = isNaN(d) ? String(noteDate) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${name} — ${dateStr}`;
}

router.get('/by-patient/:patientId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, a.date as appt_date, a.time as appt_time FROM soap_notes s LEFT JOIN appointments a ON s.appointment_id = a.id WHERE s.patient_id = $1 ORDER BY COALESCE(s.note_date, s.created_at::date) DESC`,
      [req.params.patientId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/by-appointment/:appointmentId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, p.first_name, p.last_name FROM soap_notes s LEFT JOIN patients p ON s.patient_id = p.id WHERE s.appointment_id = $1`,
      [req.params.appointmentId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/', async (req, res) => {
  try {
    const { patient_id, appointment_id } = req.query;
    let q, params;
    if (appointment_id) {
      q = `SELECT s.*, p.first_name, p.last_name FROM soap_notes s LEFT JOIN patients p ON s.patient_id = p.id WHERE s.appointment_id = $1`;
      params = [appointment_id];
    } else if (patient_id) {
      q = `SELECT s.*, a.date as appt_date, a.time as appt_time FROM soap_notes s LEFT JOIN appointments a ON s.appointment_id = a.id WHERE s.patient_id = $1 ORDER BY COALESCE(s.note_date, s.created_at::date) DESC`;
      params = [patient_id];
    } else {
      q = `SELECT s.*, p.first_name, p.last_name FROM soap_notes s LEFT JOIN patients p ON s.patient_id = p.id ORDER BY COALESCE(s.note_date, s.created_at::date) DESC LIMIT 100`;
      params = [];
    }
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, p.first_name, p.last_name FROM soap_notes s LEFT JOIN patients p ON s.patient_id = p.id WHERE s.id = $1`, [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    await auditLog(req, 'READ', 'soap_note', req.params.id);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { patient_id, patient_name, appointment_id, note_date, provider, subjective, objective, assessment, plan, icd_codes, cpt_codes } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO soap_notes (patient_id, patient_name, appointment_id, note_date, provider, subjective, objective, assessment, plan, icd_codes, cpt_codes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [patient_id||null, patient_name||null, appointment_id||null, note_date||null, provider||null, subjective||null, objective||null, assessment||null, plan||null, icd_codes||null, cpt_codes||null, req.session.staff.full_name]
    );
    await auditLog(req, 'CREATE', 'soap_note', rows[0].id);
    await logActivity(req, 'created', 'soap_note', rows[0].id, fmtSoapSummary(rows[0].patient_name, rows[0].note_date));
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { subjective, objective, assessment, plan, icd_codes, cpt_codes, note_date, provider, signed } = req.body;
    const updates = { subjective, objective, assessment, plan, icd_codes, cpt_codes, note_date, provider };
    const { rows } = await pool.query(
      `UPDATE soap_notes SET subjective=$1, objective=$2, assessment=$3, plan=$4, icd_codes=$5, cpt_codes=$6, note_date=$7, provider=$8, updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [updates.subjective||null, updates.objective||null, updates.assessment||null, updates.plan||null, updates.icd_codes||null, updates.cpt_codes||null, updates.note_date||null, updates.provider||null, req.params.id]
    );
    if (signed) {
      await pool.query('UPDATE soap_notes SET signed=TRUE, signed_at=NOW() WHERE id=$1', [req.params.id]);
    }
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    await auditLog(req, 'UPDATE', 'soap_note', req.params.id);
    await logActivity(req, 'edited', 'soap_note', rows[0].id, fmtSoapSummary(rows[0].patient_name, rows[0].note_date));
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    if (req.session.staff.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
    const pre = await pool.query('SELECT patient_name, note_date FROM soap_notes WHERE id = $1', [req.params.id]);
    const r = pre.rows[0];
    const deleteSummary = r ? fmtSoapSummary(r.patient_name, r.note_date) : `SOAP Note #${req.params.id}`;
    await pool.query('DELETE FROM soap_notes WHERE id = $1', [req.params.id]);
    await auditLog(req, 'DELETE', 'soap_note', req.params.id);
    await logActivity(req, 'deleted', 'soap_note', req.params.id, deleteSummary);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
