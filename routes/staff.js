'use strict';

const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db/pool');
const { auditLog } = require('../middleware/audit');

const router = Router();

async function sendWelcomeEmail(staffMember, tempPassword) {
  if (!process.env.SENDGRID_API_KEY) return;
  if (!staffMember.email) return;
  try {
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    const practiceEmail = process.env.PRACTICE_EMAIL || 'noreply@spinepay.com';
    await sgMail.send({
      to: staffMember.email,
      from: practiceEmail,
      subject: 'Welcome to SpinePay Pro — Your Account is Ready',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#1a1a1a">Welcome to SpinePay Pro</h2>
          <p>Hi ${staffMember.first_name},</p>
          <p>Your account at Walden Bailey Chiropractic has been created.</p>
          <p><strong>Username:</strong> ${staffMember.username}<br>
          <strong>Temporary Password:</strong> <code style="background:#f4f4f4;padding:2px 6px;border-radius:3px">${tempPassword}</code></p>
          <p>Please log in and change your password on first sign-in.</p>
          <p style="color:#888;font-size:12px">This is an automated message from SpinePay Pro.</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[Staff] SendGrid error:', err.message);
  }
}

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
    await sendWelcomeEmail({ first_name, username: rows[0].username, email: email || null }, temp_password_plain);
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

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (id === req.session.staff.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }
    await pool.query('DELETE FROM staff_hipaa WHERE staff_id = $1', [id]);
    await pool.query('DELETE FROM staff_login_history WHERE staff_id = $1', [id]);
    await pool.query(
      `DELETE FROM session WHERE (sess::jsonb->'staff'->>'id')::int = $1`,
      [id]
    );
    const { rows } = await pool.query('DELETE FROM staff WHERE id = $1 RETURNING username', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Staff member not found' });
    console.log('[Staff] Deleted:', rows[0].username);
    await auditLog(req, 'DELETE', 'staff', id);
    res.json({ success: true });
  } catch (err) {
    console.error('[Staff] Delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete staff member' });
  }
});

router.put('/:id/deactivate', async (req, res) => {
  try {
    await pool.query('UPDATE staff SET active = FALSE WHERE id = $1', [req.params.id]);
    await pool.query('DELETE FROM session WHERE sess::jsonb->>\'staff\' IS NOT NULL AND (sess::jsonb->\'staff\'->>\'id\')::int = $1', [req.params.id]);
    await auditLog(req, 'DEACTIVATE', 'staff', req.params.id);
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
