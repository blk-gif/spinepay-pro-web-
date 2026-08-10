'use strict';

/**
 * scripts/test-mail.js
 * One-off smoke test for services/mail.js → Paubox API.
 * Not part of the app. Run manually:
 *
 *   PAUBOX_API_KEY=xxx PAUBOX_SENDER_EMAIL=info@... node scripts/test-mail.js you@example.com
 *
 * Or with a .env file loaded via --env-file (Node 20+):
 *   node --env-file=.env scripts/test-mail.js you@example.com
 */

const { sendEmail } = require('../services/mail');

const to = process.argv[2];

if (!to) {
  console.error('Usage: node scripts/test-mail.js <recipient@example.com>');
  process.exit(1);
}

if (!process.env.PAUBOX_API_KEY) {
  console.error('Error: PAUBOX_API_KEY env var is not set');
  process.exit(1);
}

if (!process.env.PAUBOX_SENDER_EMAIL) {
  console.error('Error: PAUBOX_SENDER_EMAIL env var is not set');
  process.exit(1);
}

console.log(`Sending test email to: ${to}`);
console.log(`From:                  ${process.env.PAUBOX_SENDER_EMAIL}`);
console.log('');

(async () => {
  const result = await sendEmail({
    to,
    subject: 'SpinePay Pro — Paubox mail service smoke test',
    textContent: [
      'This is a test message from the SpinePay Pro mail service.',
      '',
      'If you received this, the Paubox integration is working correctly.',
      '',
      '— SpinePay Pro (automated test)',
    ].join('\n'),
    htmlContent: `
      <p>This is a test message from the <strong>SpinePay Pro</strong> mail service.</p>
      <p>If you received this, the Paubox integration is working correctly.</p>
      <p><em>— SpinePay Pro (automated test)</em></p>
    `.trim(),
  });

  if (result.success) {
    console.log('✓ Success');
    if (result.messageId) {
      console.log(`  Paubox message ID: ${result.messageId}`);
    }
    process.exit(0);
  } else {
    console.error('✗ Failed');
    console.error(`  Error: ${result.error}`);
    process.exit(1);
  }
})();
