'use strict';

const express = require('express');
const router  = express.Router();
const { validateRequest } = require('twilio');
const { handleOptOut } = require('../services/reviews');

const OPT_OUT_KEYWORDS = new Set(['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);

// POST /webhooks/twilio/sms — Twilio SMS reply handler
router.post('/twilio/sms', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (authToken) {
      const signature = req.headers['x-twilio-signature'] || '';
      const url = req.protocol + '://' + req.get('host') + req.originalUrl;
      const valid = validateRequest(authToken, signature, url, req.body);
      if (!valid) {
        console.warn('[Webhook] Invalid Twilio signature — request rejected');
        return res.status(403).send('Forbidden');
      }
    } else {
      console.warn('[Webhook] TWILIO_AUTH_TOKEN not set — skipping signature validation');
    }

    const body = (req.body.Body || '').trim().toUpperCase();
    const from = req.body.From || '';

    console.log('[Webhook] SMS from:', from, '| Body:', body);

    res.set('Content-Type', 'text/xml');

    if (OPT_OUT_KEYWORDS.has(body)) {
      await handleOptOut(from);
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>You have been unsubscribed from review requests at Walden Bailey Chiropractic. Reply START to resubscribe.</Message>
</Response>`);
    } else {
      res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
    }
  } catch (err) {
    console.error('[Webhook] Error:', err.message);
    res.status(500).send('Error');
  }
});

module.exports = router;
