'use strict';

const Stripe = require('stripe');

let _stripe = null;

/**
 * Returns a lazily-initialized Stripe client.
 * Throws at call time if STRIPE_SECRET_KEY is not set, so the
 * server still boots cleanly in environments where Stripe is not
 * configured (the error only surfaces when a payment route is hit).
 */
function getStripe() {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY environment variable is not set');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-06-20',
    });
  }
  return _stripe;
}

module.exports = { getStripe };
