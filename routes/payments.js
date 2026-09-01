'use strict';
const { Router } = require('express');
const { pool }     = require('../db/pool');
const { auditLog } = require('../middleware/audit');
const { logActivity } = require('../services/activityLog');
const { getStripe }   = require('../services/stripe');
const router = Router();

// ── Stripe: Create PaymentIntent ──────────────────────────────────────────────
// Returns a client_secret the browser uses to confirm the card with Stripe.
// Card data never passes through our server — only the amount and metadata do.
router.post('/create-intent', async (req, res) => {
  try {
    const { amount_dollars, patient_id, claim_id } = req.body;

    const dollars = parseFloat(amount_dollars);
    if (!dollars || dollars <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    const amountCents = Math.round(dollars * 100);
    if (amountCents < 50) {
      return res.status(400).json({ error: 'Amount must be at least $0.50' });
    }

    const stripe   = getStripe();
    const metadata = { created_by: req.session.staff.username };
    if (patient_id) metadata.patient_id = String(patient_id);
    if (claim_id)   metadata.claim_id   = String(claim_id);

    const pi = await stripe.paymentIntents.create({
      amount:               amountCents,
      currency:             'usd',
      payment_method_types: ['card'],
      metadata,
    });

    res.json({ client_secret: pi.client_secret, payment_intent_id: pi.id });
  } catch (err) {
    console.error('[Payments] create-intent error:', err.message);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

// ── Stripe: Confirm / record a succeeded PaymentIntent ───────────────────────
// Called by the browser after stripe.confirmCardPayment() succeeds.
// The webhook is the ultimate safety net; this endpoint gives the UI an
// immediate DB record without waiting for async webhook delivery.
router.post('/confirm', async (req, res) => {
  try {
    const { payment_intent_id, patient_id, claim_id } = req.body;

    if (!payment_intent_id) {
      return res.status(400).json({ error: 'payment_intent_id is required' });
    }

    // Idempotency — webhook may have already written this record
    const { rows: existing } = await pool.query(
      `SELECT pay.*, p.first_name, p.last_name
         FROM payments pay
         LEFT JOIN patients p ON pay.patient_id = p.id
        WHERE pay.stripe_payment_intent_id = $1`,
      [payment_intent_id]
    );
    if (existing.length > 0) {
      return res.json({ payment: existing[0], already_recorded: true });
    }

    // Retrieve the PaymentIntent from Stripe — the server is the authority on
    // amount and status, never the client.
    const stripe = getStripe();
    const pi = await stripe.paymentIntents.retrieve(payment_intent_id, {
      expand: ['latest_charge.payment_method_details'],
    });

    if (pi.status !== 'succeeded') {
      return res.status(400).json({
        error: `Payment has not succeeded (status: ${pi.status})`,
      });
    }

    const amountDollars = pi.amount / 100;
    const chargeId      = pi.latest_charge?.id || null;
    const last4         = pi.latest_charge?.payment_method_details?.card?.last4 || null;

    // Resolve patient / claim from request body (UI provided), fall back to
    // metadata that was set when the PaymentIntent was created.
    const pid = patient_id
      ? parseInt(patient_id, 10)
      : (pi.metadata?.patient_id ? parseInt(pi.metadata.patient_id, 10) : null);
    const cid = claim_id
      ? parseInt(claim_id, 10)
      : (pi.metadata?.claim_id   ? parseInt(pi.metadata.claim_id, 10)   : null);

    const { rows } = await pool.query(
      `INSERT INTO payments
         (patient_id, claim_id, amount, method, reference, date,
          notes, stripe_payment_intent_id, stripe_charge_id, card_last4)
       VALUES ($1, $2, $3, 'stripe', $4, CURRENT_DATE, $5, $6, $7, $8)
       RETURNING *`,
      [
        pid,
        cid || null,
        amountDollars,
        chargeId,
        last4 ? `Card ending ${last4}` : 'Stripe card payment',
        payment_intent_id,
        chargeId,
        last4,
      ]
    );

    // Keep linked claim's paid_amount / status in sync
    if (cid) {
      await pool.query(
        'UPDATE billing_claims SET paid_amount = paid_amount + $1, updated_at = NOW() WHERE id = $2',
        [amountDollars, cid]
      );
      const { rows: cr } = await pool.query(
        'SELECT billed_amount, paid_amount FROM billing_claims WHERE id = $1',
        [cid]
      );
      if (cr[0]) {
        const newStatus = parseFloat(cr[0].paid_amount) >= parseFloat(cr[0].billed_amount)
          ? 'paid'
          : 'partial';
        await pool.query(
          'UPDATE billing_claims SET status = $1 WHERE id = $2',
          [newStatus, cid]
        );
      }
    }

    await auditLog(req, 'CREATE', 'payment', rows[0].id);
    await logActivity(
      req, 'created', 'stripe_payment', rows[0].id,
      `$${amountDollars.toFixed(2)}${last4 ? ` — card ending ${last4}` : ''}`
    );

    res.status(201).json({ payment: rows[0] });
  } catch (err) {
    console.error('[Payments] confirm error:', err.message);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

// ── Stripe: Refund a payment (admin only) ────────────────────────────────────
// Issues the refund in Stripe, then writes an auditable refund record to
// payment_refunds.  The original payment row is never mutated.
router.post('/:id/refund', async (req, res) => {
  try {
    if (req.session.staff.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const paymentId = parseInt(req.params.id, 10);
    const { amount } = req.body; // optional — omit for full refund

    const { rows: payRows } = await pool.query(
      'SELECT * FROM payments WHERE id = $1',
      [paymentId]
    );
    if (!payRows[0]) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = payRows[0];
    if (!payment.stripe_payment_intent_id) {
      return res.status(400).json({
        error: 'This payment was not processed through Stripe and cannot be refunded here.',
      });
    }

    // Guard against double-refund on the same payment
    const { rows: prior } = await pool.query(
      'SELECT id FROM payment_refunds WHERE payment_id = $1',
      [paymentId]
    );
    if (prior.length > 0) {
      return res.status(409).json({
        error: 'A refund has already been issued for this payment.',
      });
    }

    const stripe        = getStripe();
    const refundParams  = { payment_intent: payment.stripe_payment_intent_id };
    if (amount) {
      const amountCents = Math.round(parseFloat(amount) * 100);
      if (amountCents > 0) refundParams.amount = amountCents;
    }

    const stripeRefund       = await stripe.refunds.create(refundParams);
    const refundAmountDollars = stripeRefund.amount / 100;

    const { rows: refRows } = await pool.query(
      `INSERT INTO payment_refunds (payment_id, stripe_refund_id, amount, refunded_by_name)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        paymentId,
        stripeRefund.id,
        refundAmountDollars,
        req.session.staff.full_name || req.session.staff.username,
      ]
    );

    await auditLog(req, 'CREATE', 'payment_refund', refRows[0].id);
    await logActivity(
      req, 'refunded', 'stripe_payment', paymentId,
      `$${refundAmountDollars.toFixed(2)} refund${payment.card_last4 ? ` — card ending ${payment.card_last4}` : ''}`
    );

    res.status(201).json({ refund: refRows[0] });
  } catch (err) {
    console.error('[Payments] refund error:', err.message);
    // Surface Stripe's own error message when it's a client error
    if (err.type && err.type.startsWith('Stripe')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to process refund' });
  }
});

router.get('/by-patient/:patientId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT pay.*, p.first_name, p.last_name,
          EXISTS(SELECT 1 FROM payment_refunds pr WHERE pr.payment_id = pay.id) AS refunded
         FROM payments pay LEFT JOIN patients p ON pay.patient_id = p.id
        WHERE pay.patient_id = $1 ORDER BY pay.date DESC`,
      [req.params.patientId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/', async (req, res) => {
  try {
    const { patient_id } = req.query;
    let q, params;
    if (patient_id) {
      q = `SELECT pay.*, p.first_name, p.last_name,
               EXISTS(SELECT 1 FROM payment_refunds pr WHERE pr.payment_id = pay.id) AS refunded
             FROM payments pay LEFT JOIN patients p ON pay.patient_id = p.id
            WHERE pay.patient_id = $1 ORDER BY pay.date DESC`;
      params = [patient_id];
    } else {
      q = `SELECT pay.*, p.first_name, p.last_name,
               EXISTS(SELECT 1 FROM payment_refunds pr WHERE pr.payment_id = pay.id) AS refunded
             FROM payments pay LEFT JOIN patients p ON pay.patient_id = p.id
            ORDER BY pay.date DESC LIMIT 200`;
      params = [];
    }
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
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
        const newStatus = parseFloat(cr[0].paid_amount) >= parseFloat(cr[0].billed_amount) ? 'paid' : 'partial';
        await pool.query('UPDATE billing_claims SET status = $1 WHERE id = $2', [newStatus, claim_id]);
      }
    }
    await auditLog(req, 'CREATE', 'payment', rows[0].id);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
