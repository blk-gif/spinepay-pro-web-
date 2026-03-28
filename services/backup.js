'use strict';

const cron = require('node-cron');
const { PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { pool } = require('../db/pool');
const { s3Client, BUCKET_NAME } = require('../config/s3');

const BACKUP_PREFIX = 'backups/postgresql/';

async function runBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `spinepay-backup-${timestamp}.sql`;

  console.log('[Backup] Starting PostgreSQL backup:', filename);

  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error('DATABASE_URL not set');
    if (!BUCKET_NAME) throw new Error('AWS_S3_BUCKET_NAME not set');

    const { stdout, stderr } = await execAsync(
      `pg_dump "${dbUrl}" --no-password --clean --if-exists --format=plain`,
      { maxBuffer: 100 * 1024 * 1024 }
    );

    if (stderr && !stderr.includes('WARNING')) {
      console.warn('[Backup] pg_dump stderr:', stderr);
    }

    const s3Key = `${BACKUP_PREFIX}${filename}`;
    const bodyBuffer = Buffer.from(stdout, 'utf8');

    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: bodyBuffer,
      ContentType: 'text/plain',
      ServerSideEncryption: 'AES256',
      Metadata: {
        timestamp,
        type: 'postgresql-backup',
        database: 'spinepay_pro',
      },
    }));

    console.log('[Backup] Uploaded to S3:', s3Key);

    await pool.query(
      `INSERT INTO backup_log (filename, s3_key, size_bytes, status, completed_at)
       VALUES ($1, $2, $3, 'success', NOW())`,
      [filename, s3Key, bodyBuffer.length]
    );

    await cleanOldBackups();

    console.log('[Backup] Complete:', filename);
    return { success: true, filename, s3Key };

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
  if (!process.env.SENDGRID_API_KEY) return;
  try {
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const to = process.env.BACKUP_ALERT_EMAIL || process.env.PRACTICE_EMAIL || 'drward@waldenbaileychiropratic.com';

    await sgMail.send({
      to,
      from: process.env.PRACTICE_EMAIL || 'drward@waldenbaileychiropratic.com',
      subject: 'SpinePay Pro Backup Failed',
      html: `
        <div style="font-family:Arial;max-width:600px;margin:0 auto">
          <div style="background:#cc0000;padding:20px;text-align:center">
            <h1 style="color:#fff;margin:0">Backup Failed</h1>
          </div>
          <div style="padding:30px;background:#f9f9f9">
            <h2>SpinePay Pro Automated Backup Failed</h2>
            <p><strong>Time:</strong> ${new Date().toISOString()}</p>
            <p><strong>Error:</strong> ${errorMessage}</p>
            <p>Please check the Render logs and backup status in SpinePay Pro Settings.</p>
            <p>Manual backup may be required to maintain HIPAA compliance.</p>
          </div>
          <div style="background:#1a1a1a;padding:15px;text-align:center">
            <p style="color:#888;margin:0">Walden Bailey Chiropractic &bull; SpinePay Pro</p>
          </div>
        </div>
      `,
    });
    console.log('[Backup] Failure alert email sent to', to);
  } catch (err) {
    console.error('[Backup] Failed to send alert email:', err.message);
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
