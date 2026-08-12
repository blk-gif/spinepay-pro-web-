'use strict';

const cron = require('node-cron');
const { PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { pool } = require('../db/pool');
const { s3Client, BUCKET_NAME } = require('../config/s3');
const { sendEmail } = require('./mail');

const BACKUP_PREFIX = 'backups/postgresql/';

const TABLES = [
  'staff', 'patients', 'appointments', 'soap_notes',
  'intake_forms', 'billing_claims', 'eob_records',
  'pi_cases', 'waitlist', 'time_clock', 'reminder_templates',
  'reminders', 'referrals', 'transportation', 'documents',
  'audit_log', 'backup_log', 'settings', 'staff_hipaa',
  'staff_login_history', 'hcfa_forms',
];

async function exportDatabaseToSQL() {
  let sql = `-- SpinePay Pro Database Backup\n`;
  sql += `-- Generated: ${new Date().toISOString()}\n\n`;

  for (const table of TABLES) {
    try {
      const result = await pool.query(`SELECT * FROM ${table}`);

      if (result.rows.length === 0) {
        sql += `-- Table ${table}: empty\n\n`;
        continue;
      }

      const columns = Object.keys(result.rows[0]);
      sql += `-- Table: ${table} (${result.rows.length} rows)\n`;
      sql += `DELETE FROM ${table};\n`;

      for (const row of result.rows) {
        const values = columns.map(col => {
          const val = row[col];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
          if (typeof val === 'number') return val;
          if (val instanceof Date) return `'${val.toISOString()}'`;
          return `'${String(val).replace(/'/g, "''")}'`;
        });
        sql += `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
      }

      sql += '\n';
    } catch (err) {
      sql += `-- Table ${table}: skipped (${err.message})\n\n`;
    }
  }

  return sql;
}

async function runBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `spinepay-backup-${timestamp}.sql`;

  console.log('[Backup] Starting backup:', filename);

  try {
    if (!BUCKET_NAME) throw new Error('AWS_S3_BUCKET_NAME not set');

    const sqlContent = await exportDatabaseToSQL();
    const buffer = Buffer.from(sqlContent, 'utf8');

    const s3Key = `${BACKUP_PREFIX}${filename}`;

    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: buffer,
      ContentType: 'text/plain',
      ServerSideEncryption: 'AES256',
      Metadata: { timestamp, type: 'postgresql-backup' },
    }));

    console.log('[Backup] Uploaded to S3:', s3Key);

    await pool.query(
      `INSERT INTO backup_log (filename, s3_key, size_bytes, status, completed_at)
       VALUES ($1, $2, $3, 'success', NOW())`,
      [filename, s3Key, buffer.length]
    );

    await cleanOldBackups();

    console.log('[Backup] Complete:', filename);
    return { success: true, filename, s3Key, size: buffer.length };

  } catch (err) {
    console.error('[Backup] Failed:', err.message);

    try {
      await pool.query(
        `INSERT INTO backup_log (filename, s3_key, size_bytes, status, error_message, completed_at)
         VALUES ($1, NULL, 0, 'failed', $2, NOW())`,
        [filename, err.message]
      );
    } catch (logErr) {
      console.error('[Backup] Failed to log error:', logErr.message);
    }

    await sendBackupFailureAlert(err.message);
    return { success: false, error: err.message };
  }
}

async function cleanOldBackups() {
  try {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 7);

    const listResult = await s3Client.send(new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: BACKUP_PREFIX,
    }));

    if (!listResult.Contents || listResult.Contents.length === 0) return;

    const oldFiles = listResult.Contents.filter(obj => new Date(obj.LastModified) < cutoff);

    for (const file of oldFiles) {
      await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: file.Key }));
      console.log('[Backup] Deleted old backup:', file.Key);
    }

    if (oldFiles.length > 0) {
      console.log('[Backup] Cleaned up', oldFiles.length, 'old backup(s)');
    }
  } catch (err) {
    console.error('[Backup] Cleanup error:', err.message);
  }
}

async function sendBackupFailureAlert(errorMessage) {
  const to = process.env.BACKUP_ALERT_EMAIL || process.env.PRACTICE_EMAIL || 'drward@waldenchiropractic.com';
  const result = await sendEmail({
    to,
    subject: 'SpinePay Pro Backup Failed',
    textContent: `SpinePay Pro Automated Backup Failed\n\nTime: ${new Date().toISOString()}\nError: ${errorMessage}\n\nPlease check the server logs and backup status in SpinePay Pro Settings.\n\nManual backup may be required to maintain HIPAA compliance.\n\nWalden Bailey Chiropractic • SpinePay Pro`,
    htmlContent: `
        <div style="font-family:Arial;max-width:600px;margin:0 auto">
          <div style="background:#cc0000;padding:20px;text-align:center">
            <h1 style="color:#fff;margin:0">Backup Failed</h1>
          </div>
          <div style="padding:30px;background:#f9f9f9">
            <h2>SpinePay Pro Automated Backup Failed</h2>
            <p><strong>Time:</strong> ${new Date().toISOString()}</p>
            <p><strong>Error:</strong> ${errorMessage}</p>
            <p>Please check the server logs and backup status in SpinePay Pro Settings.</p>
            <p>Manual backup may be required to maintain HIPAA compliance.</p>
          </div>
          <div style="background:#1a1a1a;padding:15px;text-align:center">
            <p style="color:#888;margin:0">Walden Bailey Chiropractic &bull; SpinePay Pro</p>
          </div>
        </div>
      `,
  });
  if (result.success) {
    console.log('[Backup] Failure alert email sent to', to);
  } else {
    console.error('[Backup] Notification email failed:', result.error);
  }
}

async function getBackupHistory(limit = 30) {
  try {
    const result = await pool.query(
      'SELECT * FROM backup_log ORDER BY completed_at DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  } catch (err) {
    console.error('[Backup] History error:', err.message);
    return [];
  }
}

async function getBackupStats() {
  try {
    const [lastBackup, totalCount, failureCount] = await Promise.all([
      pool.query(`SELECT * FROM backup_log WHERE status = 'success' ORDER BY completed_at DESC LIMIT 1`),
      pool.query(`SELECT COUNT(*) AS count FROM backup_log WHERE status = 'success'`),
      pool.query(`SELECT COUNT(*) AS count FROM backup_log WHERE status = 'failed' AND completed_at > NOW() - INTERVAL '7 days'`),
    ]);

    return {
      lastBackup:     lastBackup.rows[0] || null,
      totalBackups:   parseInt(totalCount.rows[0].count),
      recentFailures: parseInt(failureCount.rows[0].count),
    };
  } catch (err) {
    console.error('[Backup] Stats error:', err.message);
    return { lastBackup: null, totalBackups: 0, recentFailures: 0 };
  }
}

function startBackupSchedule() {
  // Run at 2:00 AM ET every day
  cron.schedule('0 2 * * *', async function scheduledBackup() {
    console.log('[Backup] Running scheduled backup...');
    await runBackup();
  }, { timezone: 'America/New_York' });

  console.log('[Backup] Scheduled daily backup at 2:00 AM ET');
}

module.exports = { runBackup, getBackupHistory, getBackupStats, startBackupSchedule };
