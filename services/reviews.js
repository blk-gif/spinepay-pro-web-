'use strict';

const cron = require('node-cron');
const { pool } = require('../db/pool');

const GOOGLE_REVIEW_URL = process.env.GOOGLE_REVIEW_URL;
const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER || '+17164532864';
const PRACTICE_NAME = 'Walden Bailey Chiropractic';

function getTwilioClient() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.warn('[Reviews] Twilio not configured');
    return null;
  }
  const twilio = require('twilio');
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

async function sendReviewRequest(reviewRequestId) {
  const result = await pool.query(
    'SELECT * FROM review_requests WHERE id = $1',
    [reviewRequestId]
  );
  if (result.rows.length === 0) return { success: false, error: 'Not found' };
  const request = result.rows[0];

  // Check opt-out
  if (request.patient_phone) {
    const optOut = await pool.query(
      'SELECT id FROM review_opt_outs WHERE phone = $1',
      [request.patient_phone.replace(/\D/g, '')]
    );
    if (optOut.rows.length > 0) {
      await pool.query(
        'UPDATE review_requests SET status = $1, opted_out = TRUE WHERE id = $2',
        ['opted_out', reviewRequestId]
      );
      return { success: false, error: 'Patient opted out' };
    }
  }

  let smsSent  = false;
  let emailSent = false;

  // Send SMS via Twilio
  if (request.patient_phone) {
    try {
      const client = getTwilioClient();
      if (client && GOOGLE_REVIEW_URL) {
        await client.messages.create({
          body: `Thank you for visiting ${PRACTICE_NAME}! We hope you're feeling better. If you have a moment, we'd love a Google review: ${GOOGLE_REVIEW_URL} Reply STOP to opt out.`,
          from: TWILIO_FROM,
          to: request.patient_phone,
        });
        smsSent = true;
        console.log('[Reviews] SMS sent to:', request.patient_phone);
      }
    } catch (err) {
      console.error('[Reviews] SMS error:', err.message);
    }
  }

  // Send Email via SendGrid
  if (request.patient_email && process.env.SENDGRID_API_KEY && GOOGLE_REVIEW_URL) {
    try {
      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      await sgMail.send({
        to: request.patient_email,
        from: process.env.PRACTICE_EMAIL || 'drward@waldenbaileychiropratic.com',
        subject: `Thank you for visiting ${PRACTICE_NAME}!`,
        html: `
          <div style="font-family:Arial;max-width:600px;margin:0 auto">
            <div style="background:#1a1a1a;padding:30px;text-align:center">
              <h1 style="color:#FFD700;margin:0">Walden Bailey Chiropractic</h1>
              <p style="color:#888">1086 Walden Ave Suite 1 &bull; Buffalo, NY 14211</p>
            </div>
            <div style="padding:40px;background:#f9f9f9">
              <h2>Thank you, ${request.patient_name}!</h2>
              <p style="font-size:16px;line-height:1.6;color:#555">
                We hope your visit went well and that you're feeling better.
                Your health and comfort are our top priorities.
              </p>
              <p style="font-size:16px;line-height:1.6;color:#555">
                If you have a moment, we would truly appreciate you sharing
                your experience with others. Your review helps us continue
                serving the Buffalo community.
              </p>
              <div style="text-align:center;margin:30px 0">
                <a href="${GOOGLE_REVIEW_URL}"
                   style="background:#FFD700;color:#000;padding:16px 32px;text-decoration:none;border-radius:8px;font-size:18px;font-weight:bold;display:inline-block">
                  &#11088; Leave a Google Review
                </a>
              </div>
              <p style="color:#999;font-size:12px;text-align:center">
                Thank you for choosing ${PRACTICE_NAME}.<br>
                (716) 893-9200 &bull; drward@waldenbaileychiropratic.com
              </p>
            </div>
          </div>
        `,
      });
      emailSent = true;
      console.log('[Reviews] Email sent to:', request.patient_email);
    } catch (err) {
      console.error('[Reviews] Email error:', err.message);
    }
  }

  const sent = smsSent || emailSent;
  await pool.query(
    `UPDATE review_requests SET status = $1, sent_at = NOW(), error_message = $2 WHERE id = $3`,
    [sent ? 'sent' : 'failed', sent ? null : 'No contact method succeeded', reviewRequestId]
  );

  return { success: sent, smsSent, emailSent };
}

async function scheduleReviewForAppointment(appointmentId) {
  try {
    const result = await pool.query(`
      SELECT a.*, p.phone, p.email, p.first_name, p.last_name
      FROM appointments a
      JOIN patients p ON p.id = a.patient_id
      WHERE a.id = $1
    `, [appointmentId]);

    if (result.rows.length === 0) return null;
    const appt = result.rows[0];

    if (!appt.phone && !appt.email) return null;

    // Don't create a duplicate
    const existing = await pool.query(
      'SELECT id FROM review_requests WHERE appointment_id = $1',
      [appointmentId]
    );
    if (existing.rows.length > 0) return null;

    const req = await pool.query(`
      INSERT INTO review_requests
        (patient_id, patient_name, patient_phone, patient_email, appointment_id, channel)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [
      appt.patient_id,
      `${appt.first_name} ${appt.last_name}`,
      appt.phone,
      appt.email,
      appointmentId,
      appt.phone ? 'SMS' : 'EMAIL',
    ]);

    console.log('[Reviews] Scheduled request ID:', req.rows[0].id);
    return req.rows[0].id;
  } catch (err) {
    console.error('[Reviews] Schedule error:', err.message);
    return null;
  }
}

async function processCompletedAppointments() {
  if (!GOOGLE_REVIEW_URL) return;
  try {
    const result = await pool.query(`
      SELECT a.id
      FROM appointments a
      LEFT JOIN review_requests rr ON rr.appointment_id = a.id
      WHERE a.status = 'Completed'
        AND a.updated_at <= NOW() - INTERVAL '2 hours'
        AND a.updated_at >= NOW() - INTERVAL '26 hours'
        AND rr.id IS NULL
    `);

    for (const row of result.rows) {
      const requestId = await scheduleReviewForAppointment(row.id);
      if (requestId) {
        await sendReviewRequest(requestId);
        await new Promise(r => setTimeout(r, 1000)); // 1s gap between sends
      }
    }
  } catch (err) {
    console.error('[Reviews] Process error:', err.message);
  }
}

async function handleOptOut(phone) {
  try {
    const normalized = phone.replace(/\D/g, '');
    await pool.query(
      'INSERT INTO review_opt_outs (phone) VALUES ($1) ON CONFLICT (phone) DO NOTHING',
      [normalized]
    );
    return true;
  } catch (err) {
    console.error('[Reviews] Opt-out error:', err.message);
    return false;
  }
}

async function getReviewStats() {
  try {
    const [total, sent, failed, optedOut, thisMonth] = await Promise.all([
      pool.query('SELECT COUNT(*) AS count FROM review_requests'),
      pool.query("SELECT COUNT(*) AS count FROM review_requests WHERE status = 'sent'"),
      pool.query("SELECT COUNT(*) AS count FROM review_requests WHERE status = 'failed'"),
      pool.query('SELECT COUNT(*) AS count FROM review_opt_outs'),
      pool.query(`SELECT COUNT(*) AS count FROM review_requests
        WHERE status = 'sent'
        AND DATE_TRUNC('month', sent_at) = DATE_TRUNC('month', NOW())`),
    ]);
    return {
      total:     parseInt(total.rows[0].count),
      sent:      parseInt(sent.rows[0].count),
      failed:    parseInt(failed.rows[0].count),
      optedOut:  parseInt(optedOut.rows[0].count),
      thisMonth: parseInt(thisMonth.rows[0].count),
    };
  } catch (err) {
    console.error('[Reviews] Stats error:', err.message);
    return { total: 0, sent: 0, failed: 0, optedOut: 0, thisMonth: 0 };
  }
}

function startReviewSchedule() {
  // Check every 15 minutes for completed appointments
  cron.schedule('*/15 * * * *', async function processReviews() {
    await processCompletedAppointments();
  });
  console.log('[Reviews] Review scheduler started — checks every 15 minutes');
}

module.exports = {
  sendReviewRequest,
  scheduleReviewForAppointment,
  handleOptOut,
  getReviewStats,
  startReviewSchedule,
};
