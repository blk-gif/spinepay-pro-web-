'use strict';

const { Router } = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const { rows } = await pool.query('SELECT * FROM staff WHERE username = $1', [username]);
    const staff = rows[0];

    // Constant-time: always run bcrypt even if user not found
    const hash = staff ? staff.password : '$2b$10$invalidhashfortimingattack0000000';
    const ok = await bcrypt.compare(password, hash);

    // Log attempt
    if (staff) {
      await pool.query(
        'INSERT INTO staff_login_history (staff_id, ip_address, success) VALUES ($1, $2, $3)',
        [staff.id, req.ip, ok]
      );
    }

    if (!staff || !ok) return res.status(401).json({ error: 'Invalid username or password' });
    if (!staff.active) return res.status(403).json({ error: 'Account deactivated. Contact your administrator.' });

    await pool.query('UPDATE staff SET last_login = NOW() WHERE id = $1', [staff.id]);

    req.session.staff = {
      id: staff.id,
      full_name: `${staff.first_name} ${staff.last_name}`,
      username: staff.username,
      role: staff.role.toLowerCase(),
      email: staff.email,
      temp_password: staff.temp_password,
      hipaa_signed: staff.hipaa_signed,
    };
    req.session.lastActivity = Date.now();

    let redirect = '/dashboard';
    if (staff.temp_password) redirect = '/change-password.html';
    else if (!staff.hipaa_signed) redirect = '/hipaa.html';

    res.json({
      success: true,
      user: req.session.staff,
      redirect,
    });
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.session?.staff) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ success: true, user: req.session.staff });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8 || !/\d/.test(newPassword)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters and include a number' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    const result = await pool.query(
      `UPDATE staff SET password = $1, temp_password = FALSE
       WHERE id = $2 RETURNING id, username, temp_password`,
      [hash, req.session.staff.id]
    );

    console.log('[Auth] Password changed for:', result.rows[0]);

    // Reassign entire staff object so express-session detects the change
    req.session.staff = { ...req.session.staff, temp_password: false };

    await new Promise((resolve, reject) => {
      req.session.save(err => err ? reject(err) : resolve());
    });

    res.json({ success: true, redirect: '/hipaa.html' });
  } catch (err) {
    console.error('[Auth] Change password error:', err.message);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// POST /api/auth/hipaa-sign
router.post('/hipaa-sign', requireAuth, async (req, res) => {
  try {
    const { signature } = req.body;

    if (!signature || signature.trim().length < 2) {
      return res.status(400).json({ error: 'Please enter your full name' });
    }

    await pool.query(
      `INSERT INTO staff_hipaa (staff_id, signature, agreed_at, policy_version)
       VALUES ($1, $2, NOW(), '1.0')
       ON CONFLICT DO NOTHING`,
      [req.session.staff.id, signature.trim()]
    );

    await pool.query(
      'UPDATE staff SET hipaa_signed = TRUE, hipaa_signed_at = NOW() WHERE id = $1',
      [req.session.staff.id]
    );

    // Reassign entire staff object so express-session detects the change
    req.session.staff = { ...req.session.staff, hipaa_signed: true };

    await new Promise((resolve, reject) => {
      req.session.save(err => err ? reject(err) : resolve());
    });

    res.json({ success: true, redirect: '/role-confirm.html' });
  } catch (err) {
    console.error('[Auth] HIPAA sign error:', err.message);
    res.status(500).json({ error: 'Failed to save HIPAA acknowledgment' });
  }
});

module.exports = router;
