'use strict';

const path   = require('path');
const fs     = require('fs');
const { Router } = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { pool }     = require('../db/pool');
const { auditLog } = require('../middleware/audit');
const { requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../services/activityLog');
const archiver = require('archiver');
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const router = Router();

function fmtDocSummary(patientName, documentType, fileName) {
  const name = patientName || 'Unknown';
  const type = documentType || 'Document';
  const file = fileName    || '';
  return file ? `${name} — ${type}: ${file}` : `${name} — ${type}`;
}

const S3_CONFIGURED = !!(
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY &&
  process.env.AWS_S3_BUCKET_NAME
);

if (!S3_CONFIGURED) {
  console.warn('[Documents] AWS S3 not configured — using local storage fallback');
}

// ── Storage backends ──────────────────────────────────────────────────────────

let s3Client, BUCKET_NAME, getSignedUrl;

if (S3_CONFIGURED) {
  ({ s3Client, BUCKET_NAME } = require('../config/s3'));
  ({ getSignedUrl } = require('@aws-sdk/s3-request-presigner'));
}

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!S3_CONFIGURED && !fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ── Multer ────────────────────────────────────────────────────────────────────

const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) return cb(null, true);
    cb(new Error('File type not allowed. Accepted: PDF, images, Word docs'));
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function retentionDate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 7);
  return d.toISOString().split('T')[0];
}

async function storeFile(file, patientId, documentType) {
  const ext    = path.extname(file.originalname).replace(/[^a-z0-9.]/gi, '') || 'bin';
  const uid    = uuidv4();
  const slug   = documentType.replace(/\s+/g, '-').toLowerCase();
  const key    = `patients/${patientId || 'general'}/${slug}/${uid}.${ext}`;

  if (S3_CONFIGURED) {
    await s3Client.send(new PutObjectCommand({
      Bucket:               BUCKET_NAME,
      Key:                  key,
      Body:                 file.buffer,
      ContentType:          file.mimetype,
      ServerSideEncryption: 'AES256',
    }));
    return { s3Key: key, s3Bucket: BUCKET_NAME };
  }

  // Local fallback — mirror the same folder structure inside uploads/
  const localDir = path.join(UPLOADS_DIR, 'patients', String(patientId || 'general'), slug);
  fs.mkdirSync(localDir, { recursive: true });
  fs.writeFileSync(path.join(localDir, `${uid}.${ext}`), file.buffer);
  return { s3Key: key, s3Bucket: null };
}

async function buildViewUrl(doc) {
  if (S3_CONFIGURED) {
    const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: doc.s3_key });
    return getSignedUrl(s3Client, command, { expiresIn: 3600 });
  }
  // Local fallback — serve from /uploads/<key>
  return `/uploads/${doc.s3_key}`;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/documents
router.get('/', async (req, res) => {
  try {
    const { patient_id, type, search } = req.query;
    let query = `
      SELECT d.*, p.first_name, p.last_name
      FROM documents d
      LEFT JOIN patients p ON p.id = d.patient_id
      WHERE d.deleted = false
    `;
    const params = [];

    if (patient_id) { params.push(patient_id); query += ` AND d.patient_id = $${params.length}`; }
    if (type)       { params.push(type);       query += ` AND d.document_type = $${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (d.file_name ILIKE $${params.length} OR d.patient_name ILIKE $${params.length})`;
    }
    query += ' ORDER BY d.created_at DESC';

    const { rows } = await pool.query(query, params);
    await auditLog(req, 'LIST', 'documents');
    res.json(rows);
  } catch (err) {
    console.error('[Documents] List error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/documents/patient/:patientId
router.get('/patient/:patientId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM documents WHERE patient_id = $1 AND deleted = false ORDER BY created_at DESC',
      [req.params.patientId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/documents/types
router.get('/types', (req, res) => {
  res.json([
    'Intake Form', 'Insurance Card', 'X-Ray', 'MRI', 'EOB',
    'PI Document', 'HIPAA Authorization', 'Referral', 'Lab Results', 'Other',
  ]);
});

// GET /api/documents/admin/stats
router.get('/admin/stats', requireAdmin, async (req, res) => {
  try {
    const [total, byType, expiringSoon, recentUploads, totalSize] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM documents WHERE deleted = false'),
      pool.query(`
        SELECT document_type, COUNT(*) as count, SUM(file_size) as total_size
        FROM documents WHERE deleted = false
        GROUP BY document_type ORDER BY count DESC
      `),
      pool.query(`
        SELECT d.*, p.first_name, p.last_name
        FROM documents d
        LEFT JOIN patients p ON p.id = d.patient_id
        WHERE d.deleted = false
        AND d.retention_date <= NOW() + INTERVAL '90 days'
        AND d.retention_date >= NOW()
        ORDER BY d.retention_date ASC
        LIMIT 20
      `),
      pool.query(`
        SELECT d.*, p.first_name, p.last_name
        FROM documents d
        LEFT JOIN patients p ON p.id = d.patient_id
        WHERE d.deleted = false
        ORDER BY d.created_at DESC
        LIMIT 10
      `),
      pool.query('SELECT SUM(file_size) as total FROM documents WHERE deleted = false'),
    ]);

    res.json({
      totalDocuments: parseInt(total.rows[0].count),
      totalSizeBytes: parseInt(totalSize.rows[0].total) || 0,
      byType: byType.rows,
      expiringSoon: expiringSoon.rows,
      recentUploads: recentUploads.rows,
    });
  } catch (err) {
    console.error('[Documents] Stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/documents/admin/audit
router.get('/admin/audit', requireAdmin, async (req, res) => {
  try {
    const { document_id, patient_id, action: actionFilter, limit = 100 } = req.query;
    let query = `
      SELECT al.*, d.file_name, d.document_type
      FROM audit_log al
      LEFT JOIN documents d ON d.id = al.resource_id::integer
      WHERE al.resource = 'document'
    `;
    const params = [];

    if (document_id) { params.push(document_id); query += ` AND al.resource_id = $${params.length}`; }
    if (patient_id)  { params.push(patient_id);  query += ` AND d.patient_id = $${params.length}`; }
    if (actionFilter){ params.push(actionFilter); query += ` AND al.action = $${params.length}`; }

    params.push(parseInt(limit));
    query += ` ORDER BY al.created_at DESC LIMIT $${params.length}`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/documents/admin/bulk-delete
router.post('/admin/bulk-delete', requireAdmin, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No document IDs provided' });
    }
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');
    await pool.query(
      `UPDATE documents SET deleted = true, deleted_at = NOW(), deleted_by = $1
       WHERE id IN (${placeholders}) AND deleted = false`,
      [req.session.staff.id, ...ids]
    );
    await auditLog(req, 'BULK_DELETE', 'document', null);
    await logActivity(req, 'deleted', 'document', null, `Bulk delete: ${ids.length} document${ids.length === 1 ? '' : 's'}`);
    res.json({ success: true, deletedCount: ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/documents/admin/patient-zip/:patientId
router.get('/admin/patient-zip/:patientId', requireAdmin, async (req, res) => {
  try {
    const { patientId } = req.params;
    const patResult = await pool.query(
      'SELECT first_name, last_name FROM patients WHERE id = $1',
      [patientId]
    );
    if (patResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    const patient = patResult.rows[0];

    const docs = await pool.query(
      'SELECT * FROM documents WHERE patient_id = $1 AND deleted = false ORDER BY document_type, created_at',
      [patientId]
    );
    if (docs.rows.length === 0) {
      return res.status(404).json({ error: 'No documents found for this patient' });
    }

    const zipName = `${patient.last_name}_${patient.first_name}_documents_${new Date().toISOString().split('T')[0]}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.pipe(res);

    for (const doc of docs.rows) {
      try {
        if (S3_CONFIGURED) {
          const command = new GetObjectCommand({
            Bucket: doc.s3_bucket || BUCKET_NAME,
            Key: doc.s3_key,
          });
          const s3Response = await s3Client.send(command);
          const folderName = doc.document_type.replace(/\s+/g, '_');
          archive.append(s3Response.Body, { name: `${folderName}/${doc.file_name}` });
        } else {
          const localPath = path.join(UPLOADS_DIR, doc.s3_key);
          if (fs.existsSync(localPath)) {
            const folderName = doc.document_type.replace(/\s+/g, '_');
            archive.file(localPath, { name: `${folderName}/${doc.file_name}` });
          }
        }
      } catch (s3Err) {
        console.error('[Documents] Could not fetch from S3:', doc.s3_key, s3Err.message);
      }
    }

    await auditLog(req, 'DOWNLOAD_ZIP', 'patient_documents', patientId);
    await archive.finalize();
  } catch (err) {
    console.error('[Documents] ZIP error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// GET /api/documents/:id/view  — returns signed/local URL
router.get('/:id/view', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM documents WHERE id = $1 AND deleted = false',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Document not found' });
    const url = await buildViewUrl(rows[0]);
    await auditLog(req, 'VIEW', 'document', req.params.id);
    res.json({ url, document: rows[0] });
  } catch (err) {
    console.error('[Documents] View error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/documents/upload
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    const { patient_id, document_type, notes } = req.body;
    if (!document_type) return res.status(400).json({ error: 'Document type is required' });

    let patientName = 'Unknown';
    if (patient_id) {
      const { rows } = await pool.query('SELECT first_name, last_name FROM patients WHERE id = $1', [patient_id]);
      if (rows[0]) patientName = `${rows[0].first_name} ${rows[0].last_name}`;
    }

    const { s3Key, s3Bucket } = await storeFile(req.file, patient_id, document_type);

    const { rows } = await pool.query(
      `INSERT INTO documents
         (patient_id, patient_name, document_type, file_name, file_size, mime_type,
          s3_key, s3_bucket, uploaded_by, uploaded_by_name, notes, retention_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        patient_id    || null,
        patientName,
        document_type,
        req.file.originalname,
        req.file.size,
        req.file.mimetype,
        s3Key,
        s3Bucket,
        req.session.staff.id,
        req.session.staff.full_name || req.session.staff.username,
        notes || null,
        retentionDate(),
      ]
    );

    await auditLog(req, 'UPLOAD', 'document', rows[0].id);
    await logActivity(req, 'created', 'document', rows[0].id, fmtDocSummary(rows[0].patient_name, rows[0].document_type, rows[0].file_name));
    res.status(201).json({ success: true, document: rows[0] });
  } catch (err) {
    console.error('[Documents] Upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/documents/:id/preview  — inline signed URL + metadata
router.get('/:id/preview', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM documents WHERE id = $1 AND deleted = false',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Document not found' });
    const doc = rows[0];

    let url;
    if (S3_CONFIGURED) {
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: doc.s3_key,
        ResponseContentDisposition: 'inline',
      });
      url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    } else {
      url = `/uploads/${doc.s3_key}`;
    }

    const PREVIEWABLE = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    await auditLog(req, 'PREVIEW', 'document', req.params.id);
    res.json({
      url,
      document: doc,
      canPreview: PREVIEWABLE.includes(doc.mime_type),
    });
  } catch (err) {
    console.error('[Documents] Preview error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/documents/:id  — update metadata (type, notes)
router.put('/:id', async (req, res) => {
  try {
    const { document_type, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE documents SET document_type = COALESCE($1, document_type), notes = COALESCE($2, notes)
       WHERE id = $3 AND deleted = false RETURNING *`,
      [document_type || null, notes !== undefined ? notes : null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Document not found' });
    await auditLog(req, 'UPDATE', 'document', req.params.id);
    await logActivity(req, 'edited', 'document', rows[0].id, fmtDocSummary(rows[0].patient_name, rows[0].document_type, rows[0].file_name));
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/documents/:id  — reassign patient and/or update category (admin only)
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { patient_id, document_type } = req.body;

    // Resolve patient_name if patient_id is being set
    let patientName = undefined;
    if (patient_id !== undefined) {
      if (patient_id === null || patient_id === '') {
        patientName = null;
      } else {
        const pr = await pool.query('SELECT first_name, last_name FROM patients WHERE id = $1', [patient_id]);
        patientName = pr.rows[0] ? `${pr.rows[0].first_name} ${pr.rows[0].last_name}` : null;
      }
    }

    const { rows } = await pool.query(
      `UPDATE documents
       SET patient_id    = CASE WHEN $1::text IS NOT NULL THEN $2::integer ELSE patient_id END,
           patient_name  = CASE WHEN $1::text IS NOT NULL THEN $3        ELSE patient_name END,
           document_type = COALESCE($4, document_type),
           updated_at    = NOW()
       WHERE id = $5 AND deleted = false
       RETURNING *`,
      [
        patient_id !== undefined ? 'set' : null,
        patient_id || null,
        patientName,
        document_type || null,
        req.params.id,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Document not found' });
    await auditLog(req, 'REASSIGN', 'document', req.params.id);
    await logActivity(req, 'edited', 'document', rows[0].id, fmtDocSummary(rows[0].patient_name, rows[0].document_type, rows[0].file_name));
    res.json(rows[0]);
  } catch (err) {
    console.error('[Documents] Patch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/documents/:id  (soft delete DB + hard delete from S3 — admin only)
router.delete('/:id', async (req, res) => {
  try {
    if (req.session.staff.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const { rows } = await pool.query(
      `UPDATE documents SET deleted = true, deleted_at = NOW(), deleted_by = $1
       WHERE id = $2 AND deleted = false
       RETURNING id, s3_key, s3_bucket, patient_name, document_type, file_name`,
      [req.session.staff.id, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Document not found' });

    // Remove file from S3
    if (S3_CONFIGURED && rows[0].s3_key) {
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: rows[0].s3_bucket || BUCKET_NAME,
          Key:    rows[0].s3_key,
        }));
      } catch (s3Err) {
        console.error('[Documents] S3 delete failed (record still soft-deleted):', s3Err.message);
      }
    }

    await auditLog(req, 'DELETE', 'document', req.params.id);
    await logActivity(req, 'deleted', 'document', rows[0].id, fmtDocSummary(rows[0].patient_name, rows[0].document_type, rows[0].file_name));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
