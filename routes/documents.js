'use strict';

const path   = require('path');
const fs     = require('fs');
const { Router } = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { pool }     = require('../db/pool');
const { auditLog } = require('../middleware/audit');

const router = Router();

const S3_CONFIGURED = !!(
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY &&
  process.env.AWS_S3_BUCKET_NAME
);

if (!S3_CONFIGURED) {
  console.warn('[Documents] AWS S3 not configured — using local storage fallback');
}

// ── Storage backends ──────────────────────────────────────────────────────────

let s3Client, BUCKET_NAME, PutObjectCommand, GetObjectCommand, getSignedUrl;

if (S3_CONFIGURED) {
  ({ s3Client, BUCKET_NAME } = require('../config/s3'));
  ({ PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3'));
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
    res.status(201).json({ success: true, document: rows[0] });
  } catch (err) {
    console.error('[Documents] Upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/documents/:id  (soft delete — admin only)
router.delete('/:id', async (req, res) => {
  try {
    if (req.session.staff.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const { rows } = await pool.query(
      `UPDATE documents SET deleted = true, deleted_at = NOW(), deleted_by = $1
       WHERE id = $2 AND deleted = false RETURNING id`,
      [req.session.staff.id, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Document not found' });
    await auditLog(req, 'DELETE', 'document', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
