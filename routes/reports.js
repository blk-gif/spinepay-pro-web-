'use strict';
const { Router } = require('express');
const { pool } = require('../db/pool');
const router = Router();

router.get('/revenue-summary', async (req, res) => {
  try {
    if (req.session.staff.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
    const { startDate, start, endDate, end } = req.query;
    const s = startDate || start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const e = endDate || end || new Date().toISOString().split('T')[0];
    const [rev, claims, pending] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE date BETWEEN $1 AND $2`, [s, e]),
      pool.query(`SELECT COALESCE(SUM(billed_amount),0) as billed, COALESCE(SUM(paid_amount),0) as collected, COUNT(*) as count FROM billing_claims WHERE service_date BETWEEN $1 AND $2`, [s, e]),
      pool.query(`SELECT COALESCE(SUM(billed_amount - paid_amount),0) as pending FROM billing_claims WHERE status NOT IN ('paid','denied') AND service_date BETWEEN $1 AND $2`, [s, e]),
    ]);
    res.json({
      total_collected: parseFloat(rev.rows[0].total),
      total_billed: parseFloat(claims.rows[0].billed),
      total_claims_collected: parseFloat(claims.rows[0].collected),
      claims_count: parseInt(claims.rows[0].count),
      pending_amount: parseFloat(pending.rows[0].pending),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/appointment-stats', async (req, res) => {
  try {
    const { startDate, start, endDate, end } = req.query;
    const s = startDate || start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const e = endDate || end || new Date().toISOString().split('T')[0];
    const { rows } = await pool.query(
      `SELECT status, COUNT(*) as count FROM appointments WHERE date BETWEEN $1 AND $2 GROUP BY status`,
      [s, e]
    );
    const stats = { total: 0, completed: 0, cancelled: 0, no_show: 0 };
    rows.forEach(r => {
      stats.total += parseInt(r.count);
      if (r.status === 'completed') stats.completed = parseInt(r.count);
      if (r.status === 'cancelled') stats.cancelled = parseInt(r.count);
      if (r.status === 'no-show') stats.no_show = parseInt(r.count);
    });
    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/full-dashboard', async (req, res) => {
  try {
    const { startDate, start, endDate, end } = req.query;
    const s = startDate || start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const e = endDate || end || new Date().toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    const [patients, todayAppts, pendingClaims, revenue] = await Promise.all([
      pool.query(`SELECT COUNT(*) as count FROM patients WHERE status = 'active'`),
      pool.query(`SELECT COUNT(*) as count FROM appointments WHERE date = $1`, [today]),
      pool.query(`SELECT COUNT(*) as count FROM billing_claims WHERE status IN ('pending','submitted','in-review')`),
      pool.query(`SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE date BETWEEN $1 AND $2`, [s, e]),
    ]);

    res.json({
      totalPatients: parseInt(patients.rows[0].count),
      todayAppointments: parseInt(todayAppts.rows[0].count),
      pendingClaims: parseInt(pendingClaims.rows[0].count),
      total_collected: parseFloat(revenue.rows[0].total),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
