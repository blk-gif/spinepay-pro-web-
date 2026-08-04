'use strict';
const { Router } = require('express');
const { pool } = require('../db/pool');
const { auditLog } = require('../middleware/audit');
const PDFDocument = require('pdfkit');
const router = Router();

// ── Helper: format a date string for PDF output ─────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  const s = String(d).split('T')[0];
  const date = new Date(s + 'T00:00:00');
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
    const { attorney_name, attorney_firm, attorney_phone, attorney_email, insurance_company, claim_number, adjuster_name, adjuster_phone, policy_limit, lien_amount, settlement_amount, case_status, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE pi_cases SET attorney_name=$1, attorney_firm=$2, attorney_phone=$3, attorney_email=$4, insurance_company=$5, claim_number=$6, adjuster_name=$7, adjuster_phone=$8, policy_limit=$9, lien_amount=$10, settlement_amount=$11, case_status=$12, notes=$13, updated_at=NOW() WHERE id=$14 RETURNING *`,
      [attorney_name||null, attorney_firm||null, attorney_phone||null, attorney_email||null, insurance_company||null, claim_number||null, adjuster_name||null, adjuster_phone||null, policy_limit||0, lien_amount||0, settlement_amount||0, case_status||'open', notes||null, req.params.id]
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

    // ── PDF Generation ───────────────────────────────────────────────────────
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="PI-Invoice-${invoiceNum}.pdf"`);
    doc.pipe(res);

    const MARGIN     = 50;
    const PAGE_W     = 612;
    const CONTENT_W  = PAGE_W - 2 * MARGIN;  // 512
    const invoiceDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // ── Practice Header ──────────────────────────────────────────────────────
    doc.fontSize(18).fillColor('#111111').font('Helvetica-Bold')
       .text('WALDEN BAILEY CHIROPRACTIC', MARGIN, MARGIN);
    doc.fontSize(9).fillColor('#555555').font('Helvetica')
       .text('1086 Walden Ave Suite 1  \u2022  Buffalo, NY 14211  \u2022  (716) 893-9200', MARGIN, MARGIN + 24);

    // Invoice label — top right
    doc.fontSize(26).fillColor('#111111').font('Helvetica-Bold')
       .text('INVOICE', MARGIN, MARGIN, { width: CONTENT_W, align: 'right' });
    doc.fontSize(9).fillColor('#555555').font('Helvetica')
       .text(`Invoice #: ${invoiceNum}`, MARGIN, MARGIN + 30, { width: CONTENT_W, align: 'right' });
    doc.fontSize(9)
       .text(`Date: ${invoiceDate}`, MARGIN, MARGIN + 44, { width: CONTENT_W, align: 'right' });

    // Gold separator line
    const sepY = MARGIN + 62;
    doc.moveTo(MARGIN, sepY).lineTo(PAGE_W - MARGIN, sepY)
       .strokeColor('#B8960C').lineWidth(2).stroke();

    // ── Billed To / Patient columns ──────────────────────────────────────────
    let y     = sepY + 16;
    const COL2 = MARGIN + Math.floor(CONTENT_W / 2);

    // LEFT — Billed To (insurance)
    doc.fontSize(8).fillColor('#888888').font('Helvetica-Bold').text('BILLED TO', MARGIN, y);
    y += 13;
    doc.fontSize(10).fillColor('#111111').font('Helvetica-Bold')
       .text(c.insurance_company || 'Insurance Company', MARGIN, y, { width: COL2 - MARGIN - 10 });
    y += 14;
    if (c.claim_number) {
      doc.fontSize(9).fillColor('#444444').font('Helvetica')
         .text(`Claim #: ${c.claim_number}`, MARGIN, y); y += 13;
    }
    if (c.adjuster_name) {
      doc.fontSize(9).fillColor('#444444').font('Helvetica')
         .text(`Adjuster: ${c.adjuster_name}`, MARGIN, y); y += 13;
    }
    if (c.adjuster_phone) {
      doc.fontSize(9).fillColor('#444444').font('Helvetica')
         .text(`Adjuster Phone: ${c.adjuster_phone}`, MARGIN, y); y += 13;
    }

    // RIGHT — Patient info (aligned to col2, same top as "BILLED TO")
    const patY = sepY + 16;
    doc.fontSize(8).fillColor('#888888').font('Helvetica-Bold').text('PATIENT', COL2, patY);
    const patName = (c.first_name && c.last_name)
      ? `${c.first_name} ${c.last_name}`
      : (c.patient_name || '\u2014');
    doc.fontSize(10).fillColor('#111111').font('Helvetica-Bold').text(patName, COL2, patY + 13);
    let patInfoY = patY + 27;
    doc.fontSize(9).fillColor('#444444').font('Helvetica');
    if (c.dob) {
      doc.text(`DOB: ${fmtDate(c.dob)}`, COL2, patInfoY); patInfoY += 13;
    }
    doc.text(`Accident Date: ${fmtDate(c.date_of_accident)}`, COL2, patInfoY); patInfoY += 13;
    if (c.attorney_name) {
      const attyLine = c.attorney_firm
        ? `${c.attorney_name} \u2014 ${c.attorney_firm}`
        : c.attorney_name;
      doc.text(`Attorney: ${attyLine}`, COL2, patInfoY); patInfoY += 13;
    }
    if (c.policy_limit && parseFloat(c.policy_limit) > 0) {
      doc.text(`Policy Limit: $${parseFloat(c.policy_limit).toFixed(2)}`, COL2, patInfoY); patInfoY += 13;
    }

    y = Math.max(y, patInfoY) + 16;

    // ── Services Table ───────────────────────────────────────────────────────
    // Column x-positions (total content width = 512)
    const T_DATE  = MARGIN;        // width 85
    const T_CPT   = MARGIN + 90;   // width 70
    const T_DESC  = MARGIN + 165;  // width 185
    const T_UNITS = MARGIN + 355;  // width 40
    const T_RATE  = MARGIN + 400;  // width 62
    const T_TOTAL = MARGIN + 467;  // width ~45, right edge = MARGIN+512=562

    const T_RIGHT = PAGE_W - MARGIN; // 562

    // Header row
    doc.rect(MARGIN, y, CONTENT_W, 20).fillColor('#EEEEEE').fill();
    doc.fontSize(8).fillColor('#333333').font('Helvetica-Bold');
    doc.text('DATE',        T_DATE,  y + 6, { width: 85 });
    doc.text('CPT CODE',    T_CPT,   y + 6, { width: 70 });
    doc.text('DESCRIPTION', T_DESC,  y + 6, { width: 185 });
    doc.text('UNITS',  T_UNITS, y + 6, { width: 40,  align: 'center' });
    doc.text('RATE',   T_RATE,  y + 6, { width: 62,  align: 'right'  });
    doc.text('TOTAL',  T_TOTAL, y + 6, { width: T_RIGHT - T_TOTAL, align: 'right' });
    y += 20;

    // Data rows
    let subtotal = 0;
    const items = Array.isArray(line_items) ? line_items : [];
    items.forEach(function drawRow(item, i) {
      const units    = parseFloat(item.units)    || 1;
      const rate     = parseFloat(item.rate)     || 0;
      const rowTotal = units * rate;
      subtotal += rowTotal;

      doc.rect(MARGIN, y, CONTENT_W, 18)
         .fillColor(i % 2 === 0 ? '#FFFFFF' : '#F8F8F8').fill();

      doc.fontSize(8).fillColor('#222222').font('Helvetica');
      doc.text(fmtDate(item.date_of_service),                  T_DATE,  y + 5, { width: 85, lineBreak: false });
      doc.text(String(item.cpt_codes  || '\u2014').slice(0, 20), T_CPT,   y + 5, { width: 70, lineBreak: false });
      doc.text(String(item.description || '\u2014').slice(0, 42),T_DESC,  y + 5, { width: 185, lineBreak: false });
      doc.text(String(units),                                  T_UNITS, y + 5, { width: 40,  align: 'center' });
      doc.text(`$${rate.toFixed(2)}`,                          T_RATE,  y + 5, { width: 62,  align: 'right'  });
      doc.text(`$${rowTotal.toFixed(2)}`,                      T_TOTAL, y + 5, { width: T_RIGHT - T_TOTAL, align: 'right' });
      y += 18;
    });

    // Bottom border of table
    doc.moveTo(MARGIN, y).lineTo(T_RIGHT, y).strokeColor('#CCCCCC').lineWidth(0.5).stroke();
    y += 12;

    // ── Totals Block ─────────────────────────────────────────────────────────
    const adj   = parseFloat(adjustment) || 0;
    const total = subtotal - adj;

    const TOT_LBL = T_RATE - 30;
    const TOT_VAL = T_TOTAL;
    const TOT_W   = T_RIGHT - T_TOTAL;

    doc.fontSize(9).fillColor('#666666').font('Helvetica')
       .text('Subtotal:', TOT_LBL, y, { width: 90, align: 'right' });
    doc.fillColor('#111111')
       .text(`$${subtotal.toFixed(2)}`, TOT_VAL, y, { width: TOT_W, align: 'right' });
    y += 14;

    if (adj > 0) {
      doc.fontSize(9).fillColor('#666666').font('Helvetica')
         .text('Adjustment:', TOT_LBL, y, { width: 90, align: 'right' });
      doc.fillColor('#111111')
         .text(`-$${adj.toFixed(2)}`, TOT_VAL, y, { width: TOT_W, align: 'right' });
      y += 14;
    }

    // Total Due dark box
    doc.rect(TOT_LBL - 4, y - 3, T_RIGHT - (TOT_LBL - 4), 24).fillColor('#1a1a1a').fill();
    doc.fontSize(11).fillColor('#FFD700').font('Helvetica-Bold')
       .text('TOTAL DUE:', TOT_LBL, y + 3, { width: 90, align: 'right' });
    doc.fillColor('#FFD700')
       .text(`$${total.toFixed(2)}`, TOT_VAL, y + 3, { width: TOT_W, align: 'right' });
    y += 32;

    // Lien amount notice
    if (c.lien_amount && parseFloat(c.lien_amount) > 0) {
      doc.fontSize(9).fillColor('#444444').font('Helvetica')
         .text(`Medical Lien Amount: $${parseFloat(c.lien_amount).toFixed(2)}`, MARGIN, y);
      y += 14;
    }

    // Optional invoice notes
    if (invoice_notes && String(invoice_notes).trim()) {
      doc.fontSize(9).fillColor('#444444').font('Helvetica')
         .text(`Notes: ${String(invoice_notes).trim()}`, MARGIN, y);
      y += 14;
    }

    y += 16;

    // ── Payment Instructions ─────────────────────────────────────────────────
    doc.moveTo(MARGIN, y).lineTo(T_RIGHT, y).strokeColor('#CCCCCC').lineWidth(0.5).stroke();
    y += 14;

    doc.fontSize(10).fillColor('#111111').font('Helvetica-Bold')
       .text('PAYMENT INSTRUCTIONS', MARGIN, y);
    y += 16;

    doc.fontSize(9).fillColor('#333333').font('Helvetica')
       .text('Please remit payment to:', MARGIN, y);
    y += 14;
    doc.fontSize(9).fillColor('#111111').font('Helvetica-Bold')
       .text('Walden Bailey Chiropractic', MARGIN, y);
    y += 13;
    doc.fontSize(9).fillColor('#555555').font('Helvetica')
       .text('1086 Walden Ave Suite 1, Buffalo, NY 14211', MARGIN, y);
    y += 13;
    doc.text('(716) 893-9200', MARGIN, y);

    y += 44;

    // ── Provider Signature Lines ──────────────────────────────────────────────
    doc.moveTo(MARGIN, y).lineTo(MARGIN + 220, y).strokeColor('#333333').lineWidth(0.5).stroke();
    doc.moveTo(MARGIN + 280, y).lineTo(MARGIN + 430, y).strokeColor('#333333').lineWidth(0.5).stroke();

    y += 5;
    doc.fontSize(8).fillColor('#888888').font('Helvetica')
       .text('Provider Signature', MARGIN, y)
       .text('Date', MARGIN + 280, y);
    y += 14;
    doc.fontSize(8).fillColor('#333333').font('Helvetica')
       .text('Dr. Walden Bailey, D.C.', MARGIN, y);

    doc.end();
    console.log(`[PI Invoice] Generated ${invoiceNum} for case ${req.params.id}`);

  } catch (err) {
    console.error('[PI Invoice]', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = router;
