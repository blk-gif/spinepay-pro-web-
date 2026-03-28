'use strict';

const { Router } = require('express');
const { pool } = require('../db/pool');
const { getReviewStats, sendReviewRequest } = require('../services/reviews');

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM settings ORDER BY key');
    const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
    res.json(settings);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/', async (req, res) => {
  try {
    const entries = Object.entries(req.body);
    if (!entries.length) return res.status(400).json({ error: 'No settings provided' });
    for (const [key, value] of entries) {
      await pool.query(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, String(value ?? '')]
      );
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Google Reviews ────────────────────────────────────────────────────────────

router.get('/review-stats', async (req, res) => {
  try {
    const stats = await getReviewStats();
    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/review-history', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM review_requests ORDER BY created_at DESC LIMIT 50'
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/review-send/:patientId', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM patients WHERE id = $1', [req.params.patientId]);
    if (!rows[0]) return res.status(404).json({ error: 'Patient not found' });
    const p = rows[0];

    const req2 = await pool.query(`
      INSERT INTO review_requests (patient_id, patient_name, patient_phone, patient_email, channel)
      VALUES ($1, $2, $3, $4, $5) RETURNING id
    `, [p.id, `${p.first_name} ${p.last_name}`, p.phone, p.email, p.phone ? 'SMS' : 'EMAIL']);

    const result = await sendReviewRequest(req2.rows[0].id);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
