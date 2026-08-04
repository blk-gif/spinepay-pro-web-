'use strict';
const { Router } = require('express');
const { pool } = require('../db/pool');
const { auditLog } = require('../middleware/audit');
const PDFDocument = require('pdfkit');
const router = Router();

// ── Date helper ──────────────────────────────────────────────────────────────
// Returns MM/DD/YYYY.  Handles both JS Date objects (from pg TIMESTAMPTZ)
// and plain strings like '1975-03-15' (from pg DATE).
function fmtDate(d) {
  if (!d) return '—';
  let y, m, day;
  if (d instanceof Date) {
    // Use UTC accessors so the date doesn't shift due to server timezone
    y   = d.getUTCFullYear();
    m   = d.getUTCMonth() + 1;
    day = d.getUTCDate();
  } else {
    // Grab first 10 chars: handles 'YYYY-MM-DD', 'YYYY-MM-DDTHH:…', etc.
    const iso = String(d).slice(0, 10);
    const parts = iso.split('-');
    if (parts.length !== 3) return String(d);
    y   = parseInt(parts[0], 10);
    m   = parseInt(parts[1], 10);
    day = parseInt(parts[2], 10);
  }
  if (isNaN(y) || isNaN(m) || isNaN(day)) return String(d);
  return `${String(m).padStart(2,'0')}/${String(day).padStart(2,'0')}/${y}`;
}

router.get('/by-patient/:patientId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT pi.*, p.first_name, p.last_name FROM pi_cases pi LEFT JOIN patients p ON pi.patient_id = p.id WHERE pi.patient_id = $1 ORDER BY pi.created_at DESC`,
      [req.params.patientId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/', async (req, res) => {
  try {
    const { patient_id } = req.query;
    const q = patient_id
      ? `SELECT * FROM pi_cases WHERE patient_id = $1 ORDER BY created_at DESC`
      : `SELECT pi.*, p.first_name, p.last_name FROM pi_cases pi LEFT JOIN patients p ON pi.patient_id = p.id ORDER BY pi.created_at DESC LIMIT 200`;
    const { rows } = await pool.query(q, patient_id ? [patient_id] : []);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { patient_id, patient_name, date_of_accident, accident_type, accident_description, attorney_name, attorney_firm, attorney_phone, attorney_email, insurance_company, claim_number, adjuster_name, adjuster_phone, policy_limit, lien_amount } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO pi_cases (patient_id, patient_name, date_of_accident, accident_type, accident_description, attorney_name, attorney_firm, attorney_phone, attorney_email, insurance_company, claim_number, adjuster_name, adjuster_phone, policy_limit, lien_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [patient_id||null, patient_name||null, date_of_accident||null, accident_type||null, accident_description||null, attorney_name||null, attorney_firm||null, attorney_phone||null, attorney_email||null, insurance_company||null, claim_number||null, adjuster_name||null, adjuster_phone||null, policy_limit||0, lien_amount||0]
    );
    await auditLog(req, 'CREATE', 'pi_case', rows[0].id);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { patient_id, patient_name, attorney_name, attorney_firm, attorney_phone, attorney_email, insurance_company, claim_number, adjuster_name, adjuster_phone, policy_limit, lien_amount, settlement_amount, case_status, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE pi_cases SET
         patient_id        = COALESCE($1::integer, patient_id),
         patient_name      = COALESCE($2, patient_name),
         attorney_name     = $3,
         attorney_firm     = $4,
         attorney_phone    = $5,
         attorney_email    = $6,
         insurance_company = $7,
         claim_number      = $8,
         adjuster_name     = $9,
         adjuster_phone    = $10,
         policy_limit      = $11,
         lien_amount       = $12,
         settlement_amount = $13,
         case_status       = $14,
         notes             = $15,
         updated_at        = NOW()
       WHERE id = $16 RETURNING *`,
      [patient_id||null, patient_name||null, attorney_name||null, attorney_firm||null, attorney_phone||null, attorney_email||null, insurance_company||null, claim_number||null, adjuster_name||null, adjuster_phone||null, policy_limit||0, lien_amount||0, settlement_amount||0, case_status||'open', notes||null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    await auditLog(req, 'UPDATE', 'pi_case', req.params.id);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    if (req.session.staff.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
    await pool.query('DELETE FROM pi_cases WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Invoice Generator ────────────────────────────────────────────────────────
router.post('/:id/invoice', async (req, res) => {
  try {
    const { line_items = [], adjustment = 0, invoice_notes = '' } = req.body;

    // Fetch PI case joined with patient
    const { rows: caseRows } = await pool.query(
      `SELECT pi.*, p.first_name, p.last_name, p.dob, p.phone, p.address, p.city, p.state, p.zip
       FROM pi_cases pi
       LEFT JOIN patients p ON pi.patient_id = p.id
       WHERE pi.id = $1`,
      [req.params.id]
    );
    if (!caseRows[0]) return res.status(404).json({ error: 'PI case not found' });
    const c = caseRows[0];

    // Generate sequential invoice number
    const { rows: invRows } = await pool.query(
      `INSERT INTO pi_invoices (pi_case_id, generated_by) VALUES ($1, $2) RETURNING id`,
      [req.params.id, req.session.staff.full_name]
    );
    const invId = invRows[0].id;
    const yr = new Date().getFullYear();
    const invoiceNum = `INV-${yr}-${String(invId).padStart(4, '0')}`;
    await pool.query('UPDATE pi_invoices SET invoice_number = $1 WHERE id = $2', [invoiceNum, invId]);
    await auditLog(req, 'CREATE', 'pi_invoice', invId);

    // ── PDF ──────────────────────────────────────────────────────────────────
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="PI-Invoice-${invoiceNum}.pdf"`);
    doc.pipe(res);

    const MARGIN    = 50;
    const PAGE_W    = 612;
    const CONTENT_W = PAGE_W - 2 * MARGIN;          // 512
    const MID       = MARGIN + Math.floor(CONTENT_W / 2); // 306 — column split
    const LEFT_W    = MID - MARGIN - 8;              // left column text width
    const RIGHT_W   = PAGE_W - MARGIN - MID - 4;    // right column text width

    const BLACK  = '#000000';
    const GRAY   = '#555555';
    const LGRAY  = '#888888';

    function fmtCurrency(n) {
      return '$' + parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    const T_RIGHT = PAGE_W - MARGIN;                // 562

    const invoiceDate = new Date().toLocaleDateString('en-US',
      { month: 'long', day: 'numeric', year: 'numeric' });

    // ── Practice Header ──────────────────────────────────────────────────────
    doc.fontSize(18).fillColor(BLACK).font('Helvetica-Bold')
       .text('WALDEN BAILEY CHIROPRACTIC', MARGIN, MARGIN);
    doc.fontSize(9).fillColor(GRAY).font('Helvetica')
       .text('1086 Walden Ave Suite 1  \u2022  Buffalo, NY 14211  \u2022  (716) 893-9200',
             MARGIN, MARGIN + 23);

    // INVOICE label — top right (same baseline as practice name)
    doc.fontSize(26).fillColor(BLACK).font('Helvetica-Bold')
       .text('INVOICE', MARGIN, MARGIN, { width: CONTENT_W, align: 'right' });
    doc.fontSize(9).fillColor(BLACK).font('Helvetica')
       .text(`Invoice #: ${invoiceNum}`, MARGIN, MARGIN + 30,
             { width: CONTENT_W, align: 'right' });
    doc.fontSize(9)
       .text(`Date: ${invoiceDate}`, MARGIN, MARGIN + 43,
             { width: CONTENT_W, align: 'right' });

    // Solid black separator
    const SEP1 = MARGIN + 60;
    doc.moveTo(MARGIN, SEP1).lineTo(T_RIGHT, SEP1)
       .strokeColor(BLACK).lineWidth(1.5).stroke();

    // ── Info Block ────────────────────────────────────────────────────────────
    // Two columns, fixed widths, lineBreak:false everywhere to prevent overlap.
    let leftY  = SEP1 + 14;
    let rightY = SEP1 + 14;

    // LEFT — Billed To
    doc.fontSize(7).fillColor(LGRAY).font('Helvetica-Bold')
       .text('BILLED TO', MARGIN, leftY, { width: LEFT_W, lineBreak: false });
    leftY += 11;
    doc.fontSize(10).fillColor(BLACK).font('Helvetica-Bold')
       .text(String(c.insurance_company || 'Insurance Company').slice(0, 35),
             MARGIN, leftY, { width: LEFT_W, lineBreak: false });
    leftY += 14;

    doc.fontSize(9).fillColor(BLACK).font('Helvetica');
    if (c.claim_number) {
      doc.text(`Claim #: ${c.claim_number}`.slice(0, 38),
               MARGIN, leftY, { width: LEFT_W, lineBreak: false });
      leftY += 13;
    }
    if (c.adjuster_name) {
      doc.text(`Adjuster: ${c.adjuster_name}`.slice(0, 38),
               MARGIN, leftY, { width: LEFT_W, lineBreak: false });
      leftY += 13;
    }
    if (c.adjuster_phone) {
      doc.text(`Adjuster Ph: ${c.adjuster_phone}`.slice(0, 38),
               MARGIN, leftY, { width: LEFT_W, lineBreak: false });
      leftY += 13;
    }

    // RIGHT — Patient & Case
    doc.fontSize(7).fillColor(LGRAY).font('Helvetica-Bold')
       .text('PATIENT', MID, rightY, { width: RIGHT_W, lineBreak: false });
    rightY += 11;

    const patName = (c.first_name && c.last_name)
      ? `${c.first_name} ${c.last_name}`
      : (c.patient_name || '\u2014');
    doc.fontSize(10).fillColor(BLACK).font('Helvetica-Bold')
       .text(patName.slice(0, 35), MID, rightY, { width: RIGHT_W, lineBreak: false });
    rightY += 14;

    doc.fontSize(9).fillColor(BLACK).font('Helvetica');
    if (c.dob) {
      doc.text(`DOB: ${fmtDate(c.dob)}`,
               MID, rightY, { width: RIGHT_W, lineBreak: false });
      rightY += 13;
    }
    doc.text(`Accident Date: ${fmtDate(c.date_of_accident)}`,
             MID, rightY, { width: RIGHT_W, lineBreak: false });
    rightY += 13;

    if (c.attorney_name) {
      // Truncate to avoid wrapping
      const attyFirm = c.attorney_firm ? ` / ${c.attorney_firm}` : '';
      const attyLine = `${c.attorney_name}${attyFirm}`.slice(0, 42);
      doc.text(`Atty: ${attyLine}`,
               MID, rightY, { width: RIGHT_W, lineBreak: false });
      rightY += 13;
    }
    if (c.policy_limit && parseFloat(c.policy_limit) > 0) {
      doc.text(`Policy Limit: ${fmtCurrency(c.policy_limit)}`,
               MID, rightY, { width: RIGHT_W, lineBreak: false });
      rightY += 13;
    }

    // Second separator — below whichever column is taller
    let y = Math.max(leftY, rightY) + 10;
    doc.moveTo(MARGIN, y).lineTo(T_RIGHT, y)
       .strokeColor(BLACK).lineWidth(0.75).stroke();
    y += 14;

    // ── Services Table ────────────────────────────────────────────────────────
    // Column x-positions
    const T_DATE  = MARGIN;       // 85 wide
    const T_CPT   = MARGIN + 90;  // 68 wide
    const T_DESC  = MARGIN + 163; // 186 wide
    const T_UNITS = MARGIN + 354; // 40 wide
    const T_RATE  = MARGIN + 399; // 62 wide
    const T_TOTAL = MARGIN + 466; // to T_RIGHT = 562 → 96 wide

    // Table header — bold text only, thick bottom rule
    doc.fontSize(8).fillColor(BLACK).font('Helvetica-Bold');
    doc.text('DATE OF SERVICE', T_DATE,  y, { width: 85,  lineBreak: false });
    doc.text('CPT CODE',        T_CPT,   y, { width: 68,  lineBreak: false });
    doc.text('DESCRIPTION',     T_DESC,  y, { width: 186, lineBreak: false });
    doc.text('UNITS',           T_UNITS, y, { width: 40,  align: 'center', lineBreak: false });
    doc.text('RATE',            T_RATE,  y, { width: 62,  align: 'right',  lineBreak: false });
    doc.text('TOTAL',           T_TOTAL, y, { width: T_RIGHT - T_TOTAL, align: 'right', lineBreak: false });
    y += 13;
    doc.moveTo(MARGIN, y).lineTo(T_RIGHT, y).strokeColor(BLACK).lineWidth(0.75).stroke();
    y += 6;

    // Data rows
    let subtotal = 0;
    const items = Array.isArray(line_items) ? line_items : [];
    items.forEach(function drawRow(item, i) {
      const units    = parseFloat(item.units)    || 1;
      const rate     = parseFloat(item.rate)     || 0;
      const rowTotal = units * rate;
      subtotal += rowTotal;

      doc.fontSize(8).fillColor(BLACK).font('Helvetica');
      doc.text(fmtDate(item.date_of_service),
               T_DATE,  y, { width: 85,  lineBreak: false });
      doc.text(String(item.cpt_codes  || '\u2014').slice(0, 18),
               T_CPT,   y, { width: 68,  lineBreak: false });
      doc.text(String(item.description || '\u2014').slice(0, 42),
               T_DESC,  y, { width: 186, lineBreak: false });
      doc.text(String(units),
               T_UNITS, y, { width: 40,  align: 'center', lineBreak: false });
      doc.text(fmtCurrency(rate),
               T_RATE,  y, { width: 62,  align: 'right',  lineBreak: false });
      doc.text(fmtCurrency(rowTotal),
               T_TOTAL, y, { width: T_RIGHT - T_TOTAL, align: 'right', lineBreak: false });
      y += 16;

      // Light row divider
      doc.moveTo(MARGIN, y - 3).lineTo(T_RIGHT, y - 3)
         .strokeColor('#CCCCCC').lineWidth(0.3).stroke();
    });

    // Bottom table border
    doc.moveTo(MARGIN, y).lineTo(T_RIGHT, y).strokeColor(BLACK).lineWidth(0.75).stroke();
    y += 12;

    // ── Totals ────────────────────────────────────────────────────────────────
    const adj   = parseFloat(adjustment) || 0;
    const total = subtotal - adj;

    // Totals layout: label takes left portion, value takes right 110pts
    const TVAL_W  = 110;                     // wide enough for any dollar amount
    const TVAL_X  = T_RIGHT - TVAL_W;        // value left edge
    const TLBL_W  = TVAL_X - MARGIN - 10;   // label fills remaining space
    const TLBL_X  = MARGIN;                  // label right-aligns into TLBL_W

    doc.fontSize(9).fillColor(GRAY).font('Helvetica')
       .text('Subtotal:', TLBL_X, y, { width: TLBL_W, align: 'right' });
    doc.fillColor(BLACK)
       .text(fmtCurrency(subtotal), TVAL_X, y, { width: TVAL_W, align: 'right' });
    y += 14;

    if (adj > 0) {
      doc.fontSize(9).fillColor(GRAY).font('Helvetica')
         .text('Adjustment:', TLBL_X, y, { width: TLBL_W, align: 'right' });
      doc.fillColor(BLACK)
         .text(`-${fmtCurrency(adj)}`, TVAL_X, y, { width: TVAL_W, align: 'right' });
      y += 14;
    }

    // Total Due — bordered box, all black
    const boxX = T_RIGHT - TVAL_W - 100;    // box starts left of label
    const boxW = T_RIGHT - boxX;
    doc.rect(boxX, y - 2, boxW, 20).strokeColor(BLACK).lineWidth(1).stroke();
    doc.fontSize(10).fillColor(BLACK).font('Helvetica-Bold')
       .text('TOTAL DUE:', boxX + 4, y + 2, { width: boxW - TVAL_W - 8, align: 'right' });
    doc.fillColor(BLACK)
       .text(fmtCurrency(total), TVAL_X, y + 2, { width: TVAL_W, align: 'right' });
    y += 28;

    // Lien amount
    if (c.lien_amount && parseFloat(c.lien_amount) > 0) {
      doc.fontSize(9).fillColor(BLACK).font('Helvetica')
         .text(`Medical Lien Amount: ${fmtCurrency(c.lien_amount)}`, MARGIN, y);
      y += 14;
    }

    // Invoice notes
    if (invoice_notes && String(invoice_notes).trim()) {
      doc.fontSize(9).fillColor(BLACK).font('Helvetica')
         .text(`Notes: ${String(invoice_notes).trim()}`, MARGIN, y);
      y += 14;
    }

    y += 14;

    // ── Payment Instructions ──────────────────────────────────────────────────
    doc.moveTo(MARGIN, y).lineTo(T_RIGHT, y)
       .strokeColor(BLACK).lineWidth(0.75).stroke();
    y += 14;

    doc.fontSize(9).fillColor(BLACK).font('Helvetica-Bold')
       .text('PAYMENT INSTRUCTIONS', MARGIN, y);
    y += 14;
    doc.fontSize(9).fillColor(BLACK).font('Helvetica')
       .text('Please remit payment to:', MARGIN, y);
    y += 13;
    doc.fontSize(9).fillColor(BLACK).font('Helvetica-Bold')
       .text('Walden Bailey Chiropractic', MARGIN, y);
    y += 12;
    doc.fontSize(9).fillColor(BLACK).font('Helvetica')
       .text('1086 Walden Ave Suite 1, Buffalo, NY 14211', MARGIN, y);
    y += 12;
    doc.text('(716) 893-9200', MARGIN, y);

    y += 40;

    // ── Signature Lines ───────────────────────────────────────────────────────
    doc.moveTo(MARGIN, y).lineTo(MARGIN + 220, y)
       .strokeColor(BLACK).lineWidth(0.5).stroke();
    doc.moveTo(MARGIN + 280, y).lineTo(MARGIN + 430, y)
       .strokeColor(BLACK).lineWidth(0.5).stroke();
    y += 5;
    doc.fontSize(8).fillColor(LGRAY).font('Helvetica')
       .text('Provider Signature', MARGIN, y)
       .text('Date', MARGIN + 280, y);
    y += 13;
    doc.fontSize(8).fillColor(BLACK).font('Helvetica')
       .text('Dr. Walden Bailey, D.C.', MARGIN, y);

    doc.end();
    console.log(`[PI Invoice] Generated ${invoiceNum} for case ${req.params.id}`);

  } catch (err) {
    console.error('[PI Invoice]', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = router;
