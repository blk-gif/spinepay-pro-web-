'use strict';

/**
 * services/mail.js
 * Shared HIPAA-compliant email service via Paubox Email API.
 *
 * Required env vars:
 *   PAUBOX_API_KEY      — Bearer token from Paubox dashboard
 *   PAUBOX_SENDER_EMAIL — Verified sender address (e.g. info@waldenbaileychiropratic.com)
 *
 * PHI SAFETY: Never log subject or content — they may contain patient names,
 * appointment details, or other protected health information.
 */

const PAUBOX_API_URL = 'https://api.paubox.net/v1/email/messages';
const RETRY_DELAY_MS = 2000;

/**
 * Sends an email via the Paubox REST API.
 *
 * @param {object} params
 * @param {string} params.to           - Recipient email address
 * @param {string} params.subject      - Email subject
 * @param {string} params.textContent  - Plain-text body
 * @param {string} [params.htmlContent] - Optional HTML body
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendEmail({ to, subject, textContent, htmlContent }) {
  const apiKey = process.env.PAUBOX_API_KEY;
  const fromAddress = process.env.PAUBOX_SENDER_EMAIL;

  if (!apiKey) {
    console.error('[mail] PAUBOX_API_KEY is not set');
    return { success: false, error: 'PAUBOX_API_KEY is not configured' };
  }
  if (!fromAddress) {
    console.error('[mail] PAUBOX_SENDER_EMAIL is not set');
    return { success: false, error: 'PAUBOX_SENDER_EMAIL is not configured' };
  }

  const body = JSON.stringify({
    data: {
      message: {
        recipients: [to],
        headers: {
          subject,
          from: fromAddress,
        },
        content: {
          'text/plain': textContent,
          ...(htmlContent ? { 'text/html': htmlContent } : {}),
        },
      },
    },
  });

  const requestOptions = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body,
  };

  return _attemptSend(to, requestOptions, true);
}

/**
 * Internal helper — performs one fetch attempt and optionally retries once
 * on network/timeout errors (not on 4xx client errors).
 */
async function _attemptSend(to, requestOptions, allowRetry) {
  let response;

  try {
    response = await fetch(PAUBOX_API_URL, requestOptions);
  } catch (networkErr) {
    // Network-level failure (no response received — DNS, timeout, etc.)
    console.error(`[mail] Network error sending to ${to}:`, networkErr.message);

    if (allowRetry) {
      console.error(`[mail] Retrying in ${RETRY_DELAY_MS}ms...`);
      await _sleep(RETRY_DELAY_MS);
      return _attemptSend(to, requestOptions, false);
    }

    return { success: false, error: `Network error: ${networkErr.message}` };
  }

  // 4xx — client error, do not retry
  if (response.status >= 400 && response.status < 500) {
    let detail = '';
    try {
      const json = await response.json();
      detail = JSON.stringify(json);
    } catch (_) {
      detail = response.statusText;
    }
    console.error(`[mail] Client error ${response.status} sending to ${to}: ${detail}`);
    return { success: false, error: `Paubox API error ${response.status}: ${detail}` };
  }

  // 5xx — server error, retry once
  if (response.status >= 500) {
    console.error(`[mail] Server error ${response.status} from Paubox sending to ${to}`);

    if (allowRetry) {
      console.error(`[mail] Retrying in ${RETRY_DELAY_MS}ms...`);
      await _sleep(RETRY_DELAY_MS);
      return _attemptSend(to, requestOptions, false);
    }

    return { success: false, error: `Paubox server error ${response.status}` };
  }

  // Success (200–299)
  let messageId;
  try {
    const json = await response.json();
    // Paubox returns { data: { message: { id: "..." } } } on success
    messageId = json?.data?.message?.id ?? json?.sourceTrackingId ?? null;
  } catch (_) {
    // Response body not JSON — treat as success without an ID
  }

  return { success: true, ...(messageId ? { messageId } : {}) };
}

function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { sendEmail };
