'use strict';

const { Router } = require('express');
const { pool } = require('../db/pool');
const { auditLog } = require('../middleware/audit');
const { requireAuth } = require('../middleware/auth');

const router = Router();

// ── Shared helpers ────────────────────────────────────────────────────────────

function normalizeStatus(raw) {
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function maybeScheduleReview(apptId) {
  if (!process.env.GOOGLE_REVIEW_URL) return;
  console.log('[Reviews] Appointment completed — scheduling review request');
  const delay = process.env.NODE_ENV === 'production'
    ? 2 * 60 * 60 * 1000  // 2 hours in production
    : 60 * 1000;           // 1 minute in dev/testing
  setTimeout(async function triggerReview() {
    try {
      const { scheduleReviewForAppointment, sendReviewRequest } = require('../services/reviews');
      console.log('[Reviews] Firing review request for appointment:', apptId);
      const requestId = await scheduleReviewForAppointment(apptId);
      if (requestId) {
        console.log('[Reviews] Sending review request ID:', requestId);
        const sendResult = await sendReviewRequest(requestId);
        console.log('[Reviews] Send result:', sendResult);
      } else {
        console.log('[Reviews] No request ID — already sent or no contact info');
      }
    } catch (err) {
      console.error('[Reviews] Delayed send error:', err.message);
    }
  }, delay);
  console.log('[Reviews] Review scheduled in', process.env.NODE_ENV === 'production' ? '2 hours' : '1 minute');
}

// ── Routes ────────────────────────────────────────────────────────────────────

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
    const { date, start, end, patient_id, status, limit } = req.query;
    let q, params;
    if (status) {
      const cap = normalizeStatus(status);
      const lim = parseInt(limit, 10) || 100;
      q = `SELECT a.*, p.first_name, p.last_name, p.phone FROM appointments a LEFT JOIN patients p ON a.patient_id = p.id WHERE a.status = $1 ORDER BY a.updated_at DESC NULLS LAST, a.date DESC LIMIT $2`;
      params = [cap, lim];
    } else if (patient_id) {
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

// Fix 1: requireAuth added
// Fix 2: status normalized via shared helper; review triggered if Completed
// Fix 3: status omitted from body → COALESCE keeps existing DB value instead of resetting to 'scheduled'
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { patient_id, patient_name, provider, date, time, duration, type, notes, room, confirmed } = req.body;
    if (!date || !time) return res.status(400).json({ error: 'Date and time required' });

    // Only normalize+apply status if the caller explicitly sent it
    const resolvedStatus = 'status' in req.body ? normalizeStatus(req.body.status) : null;

    const { rows } = await pool.query(
      `UPDATE appointments
          SET patient_id=$1, patient_name=$2, provider=$3, date=$4, time=$5,
              duration=$6, type=$7,
              status = COALESCE($8, status),
              notes=$9, room=$10, confirmed=$11
        WHERE id=$12 RETURNING *`,
      [patient_id||null, patient_name||null, provider||'Dr. Walden Bailey', date, time,
       duration||30, type||'adjustment', resolvedStatus,
       notes||null, room||null, confirmed||false, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });

    console.log('[Appointments] PUT update — status resolved to:', rows[0].status, 'for ID:', req.params.id);

    if (resolvedStatus === 'Completed') {
      maybeScheduleReview(req.params.id);
    }

    await auditLog(req, 'UPDATE', 'appointment', req.params.id);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/status', requireAuth, async (req, res, next) => {
  try {
    const { status } = req.body;
    const normalizedStatus = normalizeStatus(status);
    const { rows } = await pool.query(
      'UPDATE appointments SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [normalizedStatus, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });

    console.log('[Appointments] Status updated to:', normalizedStatus, 'for ID:', req.params.id);

    if (normalizedStatus === 'Completed') {
      maybeScheduleReview(req.params.id);
    }

    await auditLog(req, 'UPDATE_STATUS', 'appointment', req.params.id);
    res.json({ success: true, appointment: rows[0] });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM appointments WHERE id = $1', [req.params.id]);
    await auditLog(req, 'DELETE', 'appointment', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
