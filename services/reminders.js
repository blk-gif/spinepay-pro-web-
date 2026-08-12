'use strict';

const cron = require('node-cron');
const { pool } = require('../db/pool');
const { sendEmail } = require('./mail');

// ── Formatting helpers (same logic as the inline versions in the route) ────────

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-US', {
    timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const p = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${p}`;
}

// ── Core send function — used by both the manual UI route and the scheduler ────

async function sendReminderForAppointment(appointmentId, templateId) {
  const { rows: appts } = await pool.query(
    `SELECT a.*, p.first_name, p.last_name, p.phone, p.email
     FROM appointments a LEFT JOIN patients p ON a.patient_id = p.id
     WHERE a.id = $1`,
    [appointmentId]
  );
  const { rows: tmpl } = await pool.query(
    'SELECT * FROM reminder_templates WHERE id = $1',
    [templateId]
  );
  if (!appts[0] || !tmpl[0]) {
    return { success: false, notFound: true, error: 'Appointment or template not found' };
  }

  const appt = appts[0], t = tmpl[0];
  const msg = t.body
    .replace(/\{\{patient_name\}\}/g, `${appt.first_name} ${appt.last_name}`)
    .replace(/\{\{date\}\}/g, formatDate(appt.date))
    .replace(/\{\{time\}\}/g, formatTime(appt.time));
  const recipient = appt.email;

  if (!recipient || !recipient.trim()) {
    await pool.query(
      `INSERT INTO reminder_log
         (appointment_id, patient_id, template_id, type, recipient, message, status, error_reason)
       VALUES ($1,$2,$3,$4,$5,$6,'failed',$7)`,
      [appointmentId, appt.patient_id, templateId, t.type, null, msg, 'No email on file']
    );
    return { success: false, noEmail: true, error: 'No email on file for this patient' };
  }

  const result = await sendEmail({
    to: recipient,
    subject: t.subject || 'Appointment Reminder',
    textContent: msg,
  });

  if (result.success) {
    await pool.query(
      `INSERT INTO reminder_log
         (appointment_id, patient_id, template_id, type, recipient, message, status)
       VALUES ($1,$2,$3,$4,$5,$6,'sent')`,
      [appointmentId, appt.patient_id, templateId, t.type, recipient, msg]
    );
    return { success: true, message: msg, recipient };
  } else {
    await pool.query(
      `INSERT INTO reminder_log
         (appointment_id, patient_id, template_id, type, recipient, message, status, error_reason)
       VALUES ($1,$2,$3,$4,$5,$6,'failed',$7)`,
      [appointmentId, appt.patient_id, templateId, t.type, recipient, msg, result.error || 'Unknown error']
    );
    return { success: false, error: result.error || 'Failed to send email' };
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

async function processReminders() {
  try {
    // Find every (appointment, template) pair that falls inside the trigger window.
    // Window = ±15 min around trigger_hours so a 15-min check cadence never misses one.
    // Appointments are stored in America/New_York (the practice timezone).
    // NOT EXISTS on reminder_log prevents duplicate sends regardless of window overlap.
    const { rows: matches } = await pool.query(`
      SELECT a.id AS appointment_id, t.id AS template_id
      FROM reminder_templates t
      CROSS JOIN appointments a
      JOIN patients p ON a.patient_id = p.id
      WHERE t.active = TRUE
        AND a.patient_id IS NOT NULL
        AND a.time IS NOT NULL
        AND LOWER(a.status) NOT IN ('cancelled', 'no-show', 'completed')
        AND NOT EXISTS (
          SELECT 1 FROM reminder_log rl
          WHERE rl.appointment_id = a.id AND rl.template_id = t.id
        )
        AND EXTRACT(EPOCH FROM (
          (a.date + a.time) AT TIME ZONE 'America/New_York' - NOW()
        )) / 3600 BETWEEN t.trigger_hours - 0.25 AND t.trigger_hours + 0.25
    `);

    let sent = 0;
    for (const { appointment_id, template_id } of matches) {
      try {
        const result = await sendReminderForAppointment(appointment_id, template_id);
        if (result.success) sent++;
      } catch (err) {
        console.error(`[Reminders] Error for appt ${appointment_id} tmpl ${template_id}:`, err.message);
      }
    }

    console.log(`[Reminders] Checked ${matches.length} pair(s), sent ${sent} reminder(s)`);
  } catch (err) {
    console.error('[Reminders] Scheduler error:', err.message);
  }
}

function startReminderSchedule() {
  cron.schedule('*/15 * * * *', async function processScheduledReminders() {
    await processReminders();
  });
  console.log('[Reminders] Reminder scheduler started — checks every 15 minutes');
}

module.exports = { sendReminderForAppointment, startReminderSchedule };
