'use strict';

const { Router } = require('express');
const { pool } = require('../db/pool');
const { auditLog } = require('../middleware/audit');

const router = Router();

// GET /api/patients
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    let q, params;
    if (search) {
      const s = `%${search}%`;
      q = `SELECT * FROM patients WHERE first_name ILIKE $1 OR last_name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1 ORDER BY last_name, first_name LIMIT 50`;
      params = [s];
    } else {
      q = `SELECT * FROM patients WHERE status = 'active' ORDER BY last_name, first_name`;
      params = [];
    }
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/patients/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM patients WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Patient not found' });
    await auditLog(req, 'READ', 'patient', req.params.id);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/patients
router.post('/', async (req, res) => {
  try {
    const { first_name, last_name, dob, gender, phone, email, address, city, state, zip, emergency_contact, emergency_phone, insurance_name, insurance_id, group_number, notes } = req.body;
    if (!first_name || !last_name) return res.status(400).json({ error: 'First and last name required' });
    const { rows } = await pool.query(
      `INSERT INTO patients (first_name, last_name, dob, gender, phone, email, address, city, state, zip, emergency_contact, emergency_phone, insurance_name, insurance_id, group_number, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [first_name, last_name, dob||null, gender||null, phone||null, email||null, address||null, city||null, state||null, zip||null, emergency_contact||null, emergency_phone||null, insurance_name||null, insurance_id||null, group_number||null, notes||null]
    );
    await auditLog(req, 'CREATE', 'patient', rows[0].id);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/patients/:id
router.put('/:id', async (req, res) => {
  try {
    const { first_name, last_name, dob, gender, phone, email, address, city, state, zip, emergency_contact, emergency_phone, insurance_name, insurance_id, group_number, notes, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE patients SET first_name=$1, last_name=$2, dob=$3, gender=$4, phone=$5, email=$6, address=$7, city=$8, state=$9, zip=$10,
       emergency_contact=$11, emergency_phone=$12, insurance_name=$13, insurance_id=$14, group_number=$15, notes=$16, status=$17, updated_at=NOW()
       WHERE id=$18 RETURNING *`,
      [first_name, last_name, dob||null, gender||null, phone||null, email||null, address||null, city||null, state||null, zip||null, emergency_contact||null, emergency_phone||null, insurance_name||null, insurance_id||null, group_number||null, notes||null, status||'active', req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Patient not found' });
    await auditLog(req, 'UPDATE', 'patient', req.params.id);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/patients/:id (admin only)
router.delete('/:id', async (req, res) => {
  try {
    if (req.session.staff.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
    const id = req.params.id;

    // Nullify FK references on tables that lack ON DELETE SET NULL.
    // documents and review_requests were defined without it; nullify rather
    // than deleting so records remain in the system as unassigned.
    await pool.query('UPDATE documents       SET patient_id = NULL WHERE patient_id = $1', [id]);
    await pool.query('UPDATE review_requests SET patient_id = NULL WHERE patient_id = $1', [id]);

    // Auto-delete background log records (no meaningful standalone value)
    await pool.query('DELETE FROM reminder_log WHERE patient_id = $1', [id]);

    // Check clinical records that require explicit user action to remove first
    const tableChecks = [
      { label: 'appointments',   q: 'SELECT 1 FROM appointments   WHERE patient_id = $1 LIMIT 1' },
      { label: 'soap_notes',     q: 'SELECT 1 FROM soap_notes     WHERE patient_id = $1 LIMIT 1' },
      { label: 'intake_forms',   q: 'SELECT 1 FROM intake_forms   WHERE patient_id = $1 LIMIT 1' },
      { label: 'billing_claims', q: 'SELECT 1 FROM billing_claims WHERE patient_id = $1 LIMIT 1' },
      { label: 'payments',       q: 'SELECT 1 FROM payments       WHERE patient_id = $1 LIMIT 1' },
      { label: 'eob_records',    q: 'SELECT 1 FROM eob_records    WHERE patient_id = $1 LIMIT 1' },
      { label: 'referrals',      q: 'SELECT 1 FROM referrals      WHERE patient_id = $1 LIMIT 1' },
      { label: 'pi_cases',       q: 'SELECT 1 FROM pi_cases       WHERE patient_id = $1 LIMIT 1' },
      { label: 'waitlist',       q: 'SELECT 1 FROM waitlist       WHERE patient_id = $1 LIMIT 1' },
      { label: 'transportation', q: 'SELECT 1 FROM transportation WHERE patient_id = $1 LIMIT 1' },
      { label: 'hcfa_forms',     q: 'SELECT 1 FROM hcfa_forms     WHERE patient_id = $1 LIMIT 1' },
    ];

    const results = await Promise.all(
      tableChecks.map(async c => ({ label: c.label, found: (await pool.query(c.q, [id])).rows.length > 0 }))
    );
    const blocking = results.filter(r => r.found).map(r => r.label);

    if (blocking.length > 0) {
      console.log(`[Patients] DELETE blocked for patient ${id} — records in: ${blocking.join(', ')}`);
      return res.status(409).json({
        error: 'This patient has existing records. Please remove associated records first.',
        blocking_tables: blocking,
      });
    }

    await pool.query('DELETE FROM patients WHERE id = $1', [id]);
    await auditLog(req, 'DELETE', 'patient', id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
