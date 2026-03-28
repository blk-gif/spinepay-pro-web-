'use strict';

const { Router } = require('express');
const { pool } = require('../db/pool');
const { auditLog } = require('../middleware/audit');

const router = Router();

router.get('/by-patient/:patientId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*, p.first_name, p.last_name, p.phone FROM appointments a LEFT JOIN patients p ON a.patient_id = p.id WHERE a.patient_id = $1 ORDER BY a.date DESC, a.time DESC`,
      [req.params.patientId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/appointments/by-date?startDate=&endDate=
router.get('/by-date', async (req, res) => {
  try {
    const { startDate, endDate, date } = req.query;
    const s = startDate || date || new Date().toISOString().split('T')[0];
    const e = endDate || date || new Date().toISOString().split('T')[0];
    const { rows } = await pool.query(
      `SELECT a.*, p.first_name, p.last_name, p.phone FROM appointments a LEFT JOIN patients p ON a.patient_id = p.id WHERE a.date BETWEEN $1 AND $2 ORDER BY a.date ASC, a.time ASC`,
      [s, e]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/appointments?date=YYYY-MM-DD or ?start=&end=
router.get('/', async (req, res) => {
  try {
    const { date, start, end, patient_id } = req.query;
    let q, params;
    if (patient_id) {
      q = `SELECT a.*, p.first_name, p.last_name, p.phone FROM appointments a LEFT JOIN patients p ON a.patient_id = p.id WHERE a.patient_id = $1 ORDER BY a.date DESC, a.time DESC`;
      params = [patient_id];
    } else if (date) {
      q = `SELECT a.*, p.first_name, p.last_name, p.phone FROM appointments a LEFT JOIN patients p ON a.patient_id = p.id WHERE a.date = $1 ORDER BY a.time ASC`;
      params = [date];
    } else if (start && end) {
      q = `SELECT a.*, p.first_name, p.last_name, p.phone FROM appointments a LEFT JOIN patients p ON a.patient_id = p.id WHERE a.date BETWEEN $1 AND $2 ORDER BY a.date ASC, a.time ASC`;
      params = [start, end];
    } else {
      const today = new Date().toISOString().split('T')[0];
      q = `SELECT a.*, p.first_name, p.last_name, p.phone FROM appointments a LEFT JOIN patients p ON a.patient_id = p.id WHERE a.date >= $1 ORDER BY a.date ASC, a.time ASC LIMIT 100`;
      params = [today];
    }
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*, p.first_name, p.last_name FROM appointments a LEFT JOIN patients p ON a.patient_id = p.id WHERE a.id = $1`, [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { patient_id, patient_name, provider, date, time, duration, type, status, notes, room } = req.body;
    if (!date || !time) return res.status(400).json({ error: 'Date and time required' });
    const { rows } = await pool.query(
      `INSERT INTO appointments (patient_id, patient_name, provider, date, time, duration, type, status, notes, room)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [patient_id||null, patient_name||null, provider||'Dr. Walden Bailey', date, time, duration||30, type||'adjustment', status||'scheduled', notes||null, room||null]
    );
    await auditLog(req, 'CREATE', 'appointment', rows[0].id);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { patient_id, patient_name, provider, date, time, duration, type, status, notes, room, confirmed } = req.body;
    const { rows } = await pool.query(
      `UPDATE appointments SET patient_id=$1, patient_name=$2, provider=$3, date=$4, time=$5, duration=$6, type=$7, status=$8, notes=$9, room=$10, confirmed=$11
       WHERE id=$12 RETURNING *`,
      [patient_id||null, patient_name||null, provider||'Dr. Walden Bailey', date, time, duration||30, type||'adjustment', status||'scheduled', notes||null, room||null, confirmed||false, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    await auditLog(req, 'UPDATE', 'appointment', req.params.id);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const { rows } = await pool.query(
      'UPDATE appointments SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });

    // Trigger review request 2 hours after completion
    if (status === 'Completed' && process.env.GOOGLE_REVIEW_URL) {
      setTimeout(async function triggerReview() {
        try {
          const { scheduleReviewForAppointment, sendReviewRequest } = require('../services/reviews');
          const requestId = await scheduleReviewForAppointment(req.params.id);
          if (requestId) await sendReviewRequest(requestId);
        } catch (err) {
          console.error('[Reviews] Delayed trigger error:', err.message);
        }
      }, 2 * 60 * 60 * 1000);
    }

    await auditLog(req, 'UPDATE_STATUS', 'appointment', req.params.id);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM appointments WHERE id = $1', [req.params.id]);
    await auditLog(req, 'DELETE', 'appointment', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
