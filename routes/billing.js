'use strict';

const { Router } = require('express');
const { pool } = require('../db/pool');
const { auditLog } = require('../middleware/audit');
const { logActivity } = require('../services/activityLog');

const router = Router();

function fmtClaimSummary(patientName, billedAmount) {
  return `${patientName || 'Unknown'} — $${(parseFloat(billedAmount) || 0).toFixed(2)}`;
}

function fmtEobSummary(patientName, payerName, paidAmount) {
  return `${patientName || 'Unknown'} — ${payerName || 'Unknown payer'}, $${(parseFloat(paidAmount) || 0).toFixed(2)} paid`;
}

// ── CLAIMS ──────────────────────────────────────────────────────────────────

router.get('/claims', async (req, res) => {
  try {
    const { patient_id } = req.query;
    let q, params;
    if (patient_id) {
      q = `SELECT * FROM billing_claims WHERE patient_id = $1 ORDER BY created_at DESC`;
      params = [patient_id];
    } else {
      q = `SELECT c.*, p.first_name, p.last_name FROM billing_claims c LEFT JOIN patients p ON c.patient_id = p.id ORDER BY c.created_at DESC LIMIT 200`;
      params = [];
    }
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/claims', async (req, res) => {
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

router.put('/claims/:id', async (req, res) => {
  try {
    const { insurance_name, service_date, submitted_date, cpt_codes, icd_codes, billed_amount, paid_amount, status, denial_reason, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE billing_claims SET insurance_name=$1, service_date=$2, submitted_date=$3, cpt_codes=$4, icd_codes=$5,
       billed_amount=$6, paid_amount=$7, status=$8, denial_reason=$9, notes=$10, updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [insurance_name||null, service_date||null, submitted_date||null, cpt_codes||null, icd_codes||null, billed_amount||0, paid_amount||0, status||'pending', denial_reason||null, notes||null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    await auditLog(req, 'UPDATE', 'billing_claim', req.params.id);
    await logActivity(req, 'edited', 'billing_claim', rows[0].id, fmtClaimSummary(rows[0].patient_name, rows[0].billed_amount));
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/claims/:id/status', async (req, res) => {
  try {
    const { status, denial_reason } = req.body;
    const pre = await pool.query('SELECT patient_name, billed_amount FROM billing_claims WHERE id = $1', [req.params.id]);
    await pool.query('UPDATE billing_claims SET status=$1, denial_reason=$2, updated_at=NOW() WHERE id=$3', [status, denial_reason||null, req.params.id]);
    await auditLog(req, 'UPDATE', 'billing_claim', req.params.id);
    const r = pre.rows[0];
    await logActivity(req, 'edited', 'billing_claim', req.params.id,
      r ? `${r.patient_name || 'Unknown'} — status → ${status}` : `Claim #${req.params.id} — status → ${status}`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/claims/:id', async (req, res) => {
  try {
    if (req.session.staff.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
    const pre = await pool.query('SELECT patient_name, billed_amount FROM billing_claims WHERE id = $1', [req.params.id]);
    const r = pre.rows[0];
    const deleteSummary = r ? fmtClaimSummary(r.patient_name, r.billed_amount) : `Claim #${req.params.id}`;
    await pool.query('DELETE FROM billing_claims WHERE id = $1', [req.params.id]);
    await auditLog(req, 'DELETE', 'billing_claim', req.params.id);
    await logActivity(req, 'deleted', 'billing_claim', req.params.id, deleteSummary);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PAYMENTS ─────────────────────────────────────────────────────────────────

router.get('/payments', async (req, res) => {
  try {
    const { patient_id } = req.query;
    let q, params;
    if (patient_id) {
      q = `SELECT * FROM payments WHERE patient_id = $1 ORDER BY date DESC`;
      params = [patient_id];
    } else {
      q = `SELECT pay.*, p.first_name, p.last_name FROM payments pay LEFT JOIN patients p ON pay.patient_id = p.id ORDER BY pay.date DESC LIMIT 200`;
      params = [];
    }
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/payments', async (req, res) => {
  try {
    const { patient_id, claim_id, amount, method, reference, date, notes } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO payments (patient_id, claim_id, amount, method, reference, date, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [patient_id||null, claim_id||null, amount, method||null, reference||null, date||new Date().toISOString().split('T')[0], notes||null]
    );
    if (claim_id) {
      await pool.query('UPDATE billing_claims SET paid_amount = paid_amount + $1, updated_at = NOW() WHERE id = $2', [amount, claim_id]);
      const { rows: cr } = await pool.query('SELECT billed_amount, paid_amount FROM billing_claims WHERE id = $1', [claim_id]);
      if (cr[0]) {
        const newStatus = cr[0].paid_amount >= cr[0].billed_amount ? 'paid' : 'partial';
        await pool.query('UPDATE billing_claims SET status = $1 WHERE id = $2', [newStatus, claim_id]);
      }
    }
    await auditLog(req, 'CREATE', 'payment', rows[0].id);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── EOB RECORDS ──────────────────────────────────────────────────────────────

router.get('/eob', async (req, res) => {
  try {
    const { patient_id } = req.query;
    let q, params;
    if (patient_id) {
      q = `SELECT * FROM eob_records WHERE patient_id = $1 ORDER BY received_date DESC`;
      params = [patient_id];
    } else {
      q = `SELECT e.*, p.first_name, p.last_name FROM eob_records e LEFT JOIN patients p ON e.patient_id = p.id ORDER BY e.received_date DESC LIMIT 200`;
      params = [];
    }
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/eob', async (req, res) => {
  try {
    const { patient_id, patient_name, claim_id, payer_name, claim_number, service_date, billed_amount, allowed_amount, paid_amount, patient_resp, adjustment, denial_reason, received_date } = req.body;
    const discrepancy = claim_id && billed_amount;
    const { rows } = await pool.query(
      `INSERT INTO eob_records (patient_id, patient_name, claim_id, payer_name, claim_number, service_date, billed_amount, allowed_amount, paid_amount, patient_resp, adjustment, denial_reason, received_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [patient_id||null, patient_name||null, claim_id||null, payer_name||null, claim_number||null, service_date||null, billed_amount||0, allowed_amount||0, paid_amount||0, patient_resp||0, adjustment||0, denial_reason||null, received_date||null]
    );
    await auditLog(req, 'CREATE', 'eob_record', rows[0].id);
    await logActivity(req, 'created', 'eob_record', rows[0].id, fmtEobSummary(rows[0].patient_name, rows[0].payer_name, rows[0].paid_amount));
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/eob/:id', async (req, res) => {
  try {
    const { payer_name, billed_amount, allowed_amount, paid_amount, patient_resp, adjustment, denial_reason, status, received_date } = req.body;
    const { rows } = await pool.query(
      `UPDATE eob_records SET payer_name=$1, billed_amount=$2, allowed_amount=$3, paid_amount=$4, patient_resp=$5, adjustment=$6, denial_reason=$7, status=$8, received_date=$9 WHERE id=$10 RETURNING *`,
      [payer_name||null, billed_amount||0, allowed_amount||0, paid_amount||0, patient_resp||0, adjustment||0, denial_reason||null, status||'received', received_date||null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    await auditLog(req, 'UPDATE', 'eob_record', req.params.id);
    await logActivity(req, 'edited', 'eob_record', rows[0].id, fmtEobSummary(rows[0].patient_name, rows[0].payer_name, rows[0].paid_amount));
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── REVENUE SUMMARY ───────────────────────────────────────────────────────────

router.get('/revenue', async (req, res) => {
  try {
    if (req.session.staff.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
    const { start, end } = req.query;
    const s = start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const e = end || new Date().toISOString().split('T')[0];
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

// ── REVENUE STATS (dashboard card) ───────────────────────────────────────────

router.get('/revenue/stats', async (req, res) => {
  try {
    if (req.session.staff.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const yearStart  = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
    const today      = now.toISOString().split('T')[0];
    const [monthly, yearly, outstanding] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE date BETWEEN $1 AND $2`, [monthStart, today]),
      pool.query(`SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE date BETWEEN $1 AND $2`, [yearStart, today]),
      pool.query(`SELECT COALESCE(SUM(billed_amount - paid_amount),0) as total FROM billing_claims WHERE status NOT IN ('paid','denied')`),
    ]);
    res.json({
      monthly_revenue: parseFloat(monthly.rows[0].total),
      yearly_revenue: parseFloat(yearly.rows[0].total),
      outstanding_balance: parseFloat(outstanding.rows[0].total),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── REVENUE MONTHLY (last 12 months) ─────────────────────────────────────────

router.get('/revenue/monthly', async (req, res) => {
  try {
    if (req.session.staff.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
    const { rows } = await pool.query(`
      SELECT
        TO_CHAR(date_trunc('month', date), 'Mon YYYY') AS month,
        date_trunc('month', date) AS month_date,
        COALESCE(SUM(amount), 0) AS revenue
      FROM payments
      WHERE date >= NOW() - INTERVAL '12 months'
      GROUP BY date_trunc('month', date)
      ORDER BY date_trunc('month', date) ASC
    `);
    res.json(rows.map(r => ({ month: r.month, revenue: parseFloat(r.revenue) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── REVENUE BY INSURANCE ──────────────────────────────────────────────────────

router.get('/revenue/by-insurance', async (req, res) => {
  try {
    if (req.session.staff.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
    const { start, end } = req.query;
    const s = start || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    const e = end || new Date().toISOString().split('T')[0];
    const { rows } = await pool.query(`
      SELECT
        COALESCE(insurance_name, 'Unknown') AS insurance,
        COUNT(*) AS claims,
        COALESCE(SUM(billed_amount), 0) AS billed,
        COALESCE(SUM(paid_amount), 0) AS collected
      FROM billing_claims
      WHERE service_date BETWEEN $1 AND $2
      GROUP BY COALESCE(insurance_name, 'Unknown')
      ORDER BY collected DESC
      LIMIT 15
    `, [s, e]);
    res.json(rows.map(r => ({
      insurance: r.insurance,
      claims: parseInt(r.claims),
      billed: parseFloat(r.billed),
      collected: parseFloat(r.collected),
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
