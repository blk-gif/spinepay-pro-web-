'use strict';

const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db/pool');
const { auditLog } = require('../middleware/audit');

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, username, role, email, temp_password, hipaa_signed, hipaa_signed_at, last_login, active, created_at FROM staff ORDER BY last_name, first_name`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { first_name, last_name, username, role, email, temp_password_plain } = req.body;
    if (!first_name || !last_name || !username || !temp_password_plain) {
      return res.status(400).json({ error: 'First name, last name, username, and password required' });
    }
    const hash = await bcrypt.hash(temp_password_plain, 10);
    const { rows } = await pool.query(
      `INSERT INTO staff (first_name, last_name, username, password, role, email, temp_password, hipaa_signed)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE,FALSE) RETURNING id, first_name, last_name, username, role, email`,
      [first_name, last_name, username, hash, role||'Staff', email||null]
    );
    await auditLog(req, 'CREATE', 'staff', rows[0].id);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/active', async (req, res) => {
  try {
    const { active } = req.body;
    await pool.query('UPDATE staff SET active = $1 WHERE id = $2', [active, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE staff SET password = $1, temp_password = TRUE WHERE id = $2', [hash, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/login-history', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM staff_login_history WHERE staff_id = $1 ORDER BY logged_in_at DESC LIMIT 50`, [req.params.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
