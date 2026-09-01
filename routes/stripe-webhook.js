'use strict';

/**
 * POST /webhooks/stripe
 *
 * Stripe sends signed webhook events here.  This route is mounted in server.js
 * BEFORE express.json() so that req.body is the raw Buffer needed by
 * stripe.webhooks.constructEvent() for signature verification.
 *
 * No session / auth middleware — Stripe calls this directly.
 */

const { Router } = require('express');
const { getStripe } = require('../services/stripe');
const { pool }     = require('../db/pool');

const router = Router();

// ── Helper: idempotently write a succeeded PaymentIntent to the DB ──────────
async function upsertStripePayment(pi) {
  // Guard: if we already have a record for this PI (webhook fired twice, or
  // the confirm endpoint got here first), do nothing.
  const { rows: existing } = await pool.query(
    'SELECT id FROM payments WHERE stripe_payment_intent_id = $1',
    [pi.id]
  );
  if (existing.length > 0) {
    console.log('[Stripe Webhook] Payment already recorded for PI:', pi.id, '— skipping');
    return;
  }

  const amountDollars = pi.amount / 100;
  const patientId = pi.metadata?.patient_id ? parseInt(pi.metadata.patient_id, 10) : null;
  const claimId   = pi.metadata?.claim_id   ? parseInt(pi.metadata.claim_id, 10)   : null;

  // Expand the latest charge to get last4 and charge ID
  let last4    = null;
  let chargeId = null;
  try {
    const stripe = getStripe();
    const fullPi = await stripe.paymentIntents.retrieve(pi.id, {
      expand: ['latest_charge.payment_method_details'],
    });
    chargeId = fullPi.latest_charge?.id || null;
    last4    = fullPi.latest_charge?.payment_method_details?.card?.last4 || null;
  } catch (err) {
    console.error('[Stripe Webhook] Could not expand latest_charge:', err.message);
  }

  const { rows } = await pool.query(
    `INSERT INTO payments
       (patient_id, claim_id, amount, method, reference, date,
        notes, stripe_payment_intent_id, stripe_charge_id, card_last4)
     VALUES ($1, $2, $3, 'stripe', $4, CURRENT_DATE, $5, $6, $7, $8)
     RETURNING *`,
    [
      patientId,
      claimId || null,
      amountDollars,
      chargeId,
      last4 ? `Card ending ${last4}` : 'Stripe card payment',
      pi.id,
      chargeId,
      last4,
    ]
  );

  console.log('[Stripe Webhook] Payment recorded id=%d PI=%s amount=$%s last4=%s',
    rows[0].id, pi.id, amountDollars.toFixed(2), last4 || 'n/a');

  // ── Keep linked claim's paid_amount / status in sync ─────────────────────
  if (claimId) {
    await pool.query(
      'UPDATE billing_claims SET paid_amount = paid_amount + $1, updated_at = NOW() WHERE id = $2',
      [amountDollars, claimId]
    );
    const { rows: cr } = await pool.query(
      'SELECT billed_amount, paid_amount FROM billing_claims WHERE id = $1',
      [claimId]
    );
    if (cr[0]) {
      const newStatus = parseFloat(cr[0].paid_amount) >= parseFloat(cr[0].billed_amount)
        ? 'paid'
        : 'partial';
      await pool.query(
        'UPDATE billing_claims SET status = $1 WHERE id = $2',
        [newStatus, claimId]
      );
    }
  }
}

// ── Webhook endpoint ──────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const sig           = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET is not set — rejecting');
    return res.status(500).send('Webhook secret not configured');
  }

  // req.body is a raw Buffer because express.raw() is applied in server.js
  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.warn('[Stripe Webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('[Stripe Webhook] Received event type=%s id=%s', event.type, event.id);

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        await upsertStripePayment(event.data.object);
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        console.warn('[Stripe Webhook] Payment FAILED PI=%s reason=%s',
          pi.id,
          pi.last_payment_error?.message || 'unknown'
        );
        break;
      }
      default:
        // Unhandled event type — acknowledge so Stripe stops retrying
        console.log('[Stripe Webhook] Unhandled event type:', event.type);
    }
  } catch (err) {
    console.error('[Stripe Webhook] Handler error for event %s: %s', event.id, err.message);
    // Return 500 so Stripe will retry delivery
    return res.status(500).send('Internal error processing webhook');
  }

  res.json({ received: true });
});

module.exports = router;
