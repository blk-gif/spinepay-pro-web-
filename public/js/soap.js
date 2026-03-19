'use strict';

// ── SOAP Notes Module ─────────────────────────────────────────────────────────
window.SoapNotes = (() => {
  const { toast, confirm, statusBadge, openModal, closeModal, setupModalClose,
          formatDate, formatTime, formatCurrency, getCurrentUser, todayString } = window.App;

  let allNotes    = [];
  let allPatients = [];
  let editingNoteId = null;
  let viewMode    = 'list'; // 'list' | 'detail'
  let currentNote = null;

  // ── Build HTML ──────────────────────────────────────────────────────────────
  function buildHTML() {
    return `
      <div class="card card-gold" id="soapListCard">
        <div class="filter-bar">
          <div class="filter-search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" class="form-control" id="soapSearch" placeholder="Search by patient name..." />
          </div>
          <div style="flex:1;"></div>
          <button class="btn btn-primary btn-sm" id="newSoapBtn" style="display:none;">
            <i class="fa-solid fa-plus"></i> New SOAP Note
          </button>
        </div>
        <div class="table-wrapper">
          <table id="soapTable">
            <thead>
              <tr>
                <th>Date</th>
                <th>Patient</th>
                <th>Appointment Type</th>
                <th>Diagnosis Codes</th>
                <th>Created By</th>
                <th style="width:110px;">Actions</th>
              </tr>
            </thead>
            <tbody id="soapTableBody">
              <tr><td colspan="6"><div class="table-empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading...</p></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Detail View -->
      <div id="soapDetailCard" style="display:none;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
          <button class="btn btn-secondary btn-sm" id="soapBackBtn">
            <i class="fa-solid fa-arrow-left"></i> Back to List
          </button>
          <div style="flex:1;"></div>
          <button class="btn btn-outline btn-sm" id="soapPrintBtn">
            <i class="fa-solid fa-print"></i> Print
          </button>
          <button class="btn btn-primary btn-sm" id="soapEditBtn" style="display:none;">
            <i class="fa-solid fa-pen"></i> Edit
          </button>
          <button class="btn btn-danger btn-sm" id="soapDeleteBtn" style="display:none;">
            <i class="fa-solid fa-trash"></i> Delete
          </button>
        </div>
        <div class="card card-gold" id="soapDetailContent"></div>
      </div>

      <!-- New / Edit SOAP Note Modal -->
      <div class="modal-overlay" id="soapModal">
        <div class="modal modal-lg">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-notes-medical"></i> <span id="soapModalTitle">New SOAP Note</span></div>
            <button class="modal-close" id="soapModalClose">&times;</button>
          </div>
          <div class="modal-body">
            <form id="soapForm">
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label">Patient <span class="required">*</span></label>
                  <select class="form-control" id="soapPatient" required>
                    <option value="">Select patient...</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Appointment</label>
                  <select class="form-control" id="soapAppointment">
                    <option value="">Select appointment (optional)...</option>
                  </select>
                </div>
              </div>

              <div style="margin:8px 0 14px;padding:10px 14px;background:rgba(212,175,55,0.08);border-left:3px solid var(--gold);border-radius:0 var(--radius-sm) var(--radius-sm) 0;font-size:12px;color:var(--text-secondary);">
                <i class="fa-solid fa-circle-info" style="color:var(--gold);margin-right:6px;"></i>
                Complete all four SOAP sections below.
              </div>

              <div class="form-group">
                <label class="form-label" style="color:var(--gold);font-weight:700;">
                  <i class="fa-solid fa-s"></i> Subjective — Patient's Description of Symptoms
                </label>
                <textarea class="form-control" id="soapSubjective" rows="4" placeholder="Chief complaint, onset, duration, quality, aggravating/relieving factors, associated symptoms..."></textarea>
              </div>

              <div class="form-group">
                <label class="form-label" style="color:var(--gold);font-weight:700;">
                  <i class="fa-solid fa-o"></i> Objective — Measurable Findings
                </label>
                <textarea class="form-control" id="soapObjective" rows="4" placeholder="Vital signs, ROM, orthopedic tests, palpation findings, neurological exam results..."></textarea>
              </div>

              <div class="form-group">
                <label class="form-label" style="color:var(--gold);font-weight:700;">
                  <i class="fa-solid fa-a"></i> Assessment — Diagnosis / Clinical Impression
                </label>
                <textarea class="form-control" id="soapAssessment" rows="4" placeholder="Clinical diagnosis, severity, response to treatment, progress notes..."></textarea>
              </div>

              <div class="form-group">
                <label class="form-label" style="color:var(--gold);font-weight:700;">
                  <i class="fa-solid fa-p"></i> Plan — Treatment Plan
                </label>
                <textarea class="form-control" id="soapPlan" rows="4" placeholder="Adjustments performed, therapies, home exercises, referrals, next visit, patient education..."></textarea>
              </div>

              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label">Diagnosis Codes (ICD-10)</label>
                  <input type="text" class="form-control" id="soapDiagnosisCodes" placeholder="e.g. M54.5, M99.01, M47.812" />
                  <small style="color:var(--text-muted);font-size:11px;">Comma-separated ICD-10 codes</small>
                </div>
                <div class="form-group">
                  <label class="form-label">Procedure Codes (CPT)</label>
                  <input type="text" class="form-control" id="soapProcedureCodes" placeholder="e.g. 98941, 97012, 97110" />
                  <small style="color:var(--text-muted);font-size:11px;">Comma-separated CPT codes</small>
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="soapModalCancel">Cancel</button>
            <button class="btn btn-primary" id="soapModalSave">
              <i class="fa-solid fa-floppy-disk"></i> Save SOAP Note
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  async function render() {
    const view = document.getElementById('view-soap');
    if (!view.querySelector('#soapListCard')) {
      view.innerHTML = buildHTML();
      bindEvents();
    }

    const user = getCurrentUser();
    if (user && user.role === 'admin') {
      const btn = document.getElementById('newSoapBtn');
      if (btn) btn.style.display = 'inline-flex';
    }

    showListView();
    allPatients = await window.api.patients.getAll();
    populatePatientSelect();
    await loadNotes();
  }

  async function loadNotes() {
    try {
      // Load all notes by fetching per patient then flattening, or use a getAll if available
      let notes = [];
      // Try a generic getAll first; fall back to per-patient if needed
      try {
        notes = await window.api.soap.getAll();
      } catch (_) {
        // If no getAll, load from all patients
        const results = await Promise.all(
          allPatients.map(p => window.api.soap.getByPatient(p.id).catch(() => []))
        );
        notes = results.flat();
      }
      allNotes = notes;
      renderTable();
    } catch (err) {
      console.error(err);
      toast('Failed to load SOAP notes', 'error');
    }
  }

  function populatePatientSelect() {
    const sorted = [...allPatients].sort((a, b) => a.last_name.localeCompare(b.last_name));
    const opts = '<option value="">Select patient...</option>' +
      sorted.map(p => `<option value="${p.id}">${p.last_name}, ${p.first_name}</option>`).join('');
    const sel = document.getElementById('soapPatient');
    if (sel) sel.innerHTML = opts;
  }

  // ── Table Render ────────────────────────────────────────────────────────────
  function renderTable() {
    const search = (document.getElementById('soapSearch')?.value || '').toLowerCase();
    let filtered = allNotes.filter(n => {
      const name = `${n.first_name || ''} ${n.last_name || ''}`.toLowerCase();
      return !search || name.includes(search);
    });

    // Sort newest first
    filtered = filtered.sort((a, b) => new Date(b.created_at || b.note_date || 0) - new Date(a.created_at || a.note_date || 0));

    const tbody = document.getElementById('soapTableBody');
    if (!tbody) return;

    const user = getCurrentUser();
    const isAdmin = user && user.role === 'admin';

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="table-empty"><i class="fa-regular fa-file-lines"></i><p>No SOAP notes found</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(n => {
      const diagCodes = n.diagnosis_codes || n.icd_codes || '—';
      const apptType  = n.appointment_type || n.appt_type || '—';
      const createdBy = n.created_by_name || n.created_by || '—';
      return `<tr class="clickable" onclick="window.SoapNotes.openDetail(${n.id})">
        <td class="td-primary">${formatDate(n.note_date || n.created_at)}</td>
        <td>${n.first_name || ''} ${n.last_name || ''}</td>
        <td style="text-transform:capitalize;">${apptType}</td>
        <td style="font-size:12px;font-family:monospace;">${diagCodes}</td>
        <td style="font-size:12px;">${createdBy}</td>
        <td onclick="event.stopPropagation()">
          <div class="action-row" style="gap:4px;">
            <button class="btn btn-icon btn-sm btn-outline" title="View" onclick="window.SoapNotes.openDetail(${n.id})">
              <i class="fa-solid fa-eye"></i>
            </button>
            ${isAdmin ? `
            <button class="btn btn-icon btn-sm btn-outline" title="Edit" onclick="window.SoapNotes.openEdit(${n.id})">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-icon btn-sm btn-danger" title="Delete" onclick="window.SoapNotes.deleteNote(${n.id})">
              <i class="fa-solid fa-trash"></i>
            </button>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // ── Detail View ─────────────────────────────────────────────────────────────
  function openDetail(id) {
    const note = allNotes.find(n => n.id === id);
    if (!note) return;
    currentNote = note;

    const user = getCurrentUser();
    const isAdmin = user && user.role === 'admin';

    const editBtn   = document.getElementById('soapEditBtn');
    const deleteBtn = document.getElementById('soapDeleteBtn');
    if (editBtn)   editBtn.style.display   = isAdmin ? 'inline-flex' : 'none';
    if (deleteBtn) deleteBtn.style.display = isAdmin ? 'inline-flex' : 'none';

    const content = document.getElementById('soapDetailContent');
    if (content) {
      content.innerHTML = buildDetailHTML(note);
    }

    showDetailView();
  }

  function buildDetailHTML(note) {
    const diagCodes = (note.diagnosis_codes || note.icd_codes || '').split(',').map(c => c.trim()).filter(Boolean);
    const procCodes = (note.procedure_codes || note.cpt_codes || '').split(',').map(c => c.trim()).filter(Boolean);
    const apptType  = note.appointment_type || note.appt_type || '—';
    const createdBy = note.created_by_name || note.created_by || '—';

    const codeTag = c => `<span style="display:inline-block;background:rgba(212,175,55,0.15);border:1px solid rgba(212,175,55,0.3);color:var(--gold);padding:2px 8px;border-radius:4px;font-family:monospace;font-size:12px;margin:2px 4px 2px 0;">${c}</span>`;

    return `
      <div style="padding:24px;">
        <!-- Header -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px;padding-bottom:18px;border-bottom:1px solid var(--border);">
          <div>
            <div style="font-size:20px;font-weight:800;color:var(--text-primary);">
              ${note.first_name || ''} ${note.last_name || ''}
            </div>
            <div style="color:var(--text-muted);font-size:13px;margin-top:4px;">
              <i class="fa-solid fa-calendar-days" style="color:var(--gold);margin-right:6px;"></i>${formatDate(note.note_date || note.created_at)}
              &nbsp;&bull;&nbsp;
              <i class="fa-solid fa-stethoscope" style="color:var(--gold);margin-right:6px;"></i>${apptType}
              &nbsp;&bull;&nbsp;
              <i class="fa-solid fa-user-doctor" style="color:var(--gold);margin-right:6px;"></i>${createdBy}
            </div>
          </div>
          <div style="text-align:right;">
            ${diagCodes.length ? `<div style="margin-bottom:6px;">${diagCodes.map(codeTag).join('')}</div>` : ''}
            ${procCodes.length ? `<div>${procCodes.map(codeTag).join('')}</div>` : ''}
          </div>
        </div>

        <!-- SOAP Sections -->
        <div style="display:grid;gap:20px;">
          ${soapSection('S', 'Subjective', 'fa-comment-medical', note.subjective)}
          ${soapSection('O', 'Objective', 'fa-microscope', note.objective)}
          ${soapSection('A', 'Assessment', 'fa-clipboard-check', note.assessment)}
          ${soapSection('P', 'Plan', 'fa-list-check', note.plan)}
        </div>
      </div>
    `;
  }

  function soapSection(letter, label, icon, content) {
    return `
      <div style="border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;">
        <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;background:rgba(212,175,55,0.07);border-bottom:1px solid var(--border);">
          <div style="width:30px;height:30px;border-radius:50%;background:var(--gold);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:14px;color:#000;flex-shrink:0;">${letter}</div>
          <div>
            <div style="font-weight:700;font-size:14px;color:var(--text-primary);">${label}</div>
            <div style="font-size:11px;color:var(--text-muted);"><i class="fa-solid ${icon}" style="margin-right:4px;"></i>${getSoapSectionSubtitle(letter)}</div>
          </div>
        </div>
        <div style="padding:16px;color:var(--text-secondary);font-size:14px;line-height:1.7;white-space:pre-wrap;min-height:60px;">
          ${content ? escapeHtml(content) : '<span style="color:var(--text-muted);font-style:italic;">No content recorded.</span>'}
        </div>
      </div>
    `;
  }

  function getSoapSectionSubtitle(letter) {
    return { S: "Patient's description of symptoms", O: 'Measurable clinical findings', A: 'Diagnosis / clinical impression', P: 'Treatment plan & next steps' }[letter] || '';
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Show/Hide Views ─────────────────────────────────────────────────────────
  function showListView() {
    viewMode = 'list';
    const list   = document.getElementById('soapListCard');
    const detail = document.getElementById('soapDetailCard');
    if (list)   list.style.display   = 'block';
    if (detail) detail.style.display = 'none';
  }

  function showDetailView() {
    viewMode = 'detail';
    const list   = document.getElementById('soapListCard');
    const detail = document.getElementById('soapDetailCard');
    if (list)   list.style.display   = 'none';
    if (detail) detail.style.display = 'block';
  }

  // ── Modal: New ──────────────────────────────────────────────────────────────
  function openNew() {
    editingNoteId = null;
    document.getElementById('soapModalTitle').textContent = 'New SOAP Note';
    document.getElementById('soapForm').reset();
    document.getElementById('soapAppointment').innerHTML = '<option value="">Select appointment (optional)...</option>';
    openModal('soapModal');
  }

  // ── Modal: Edit ─────────────────────────────────────────────────────────────
  function openEdit(id) {
    const note = allNotes.find(n => n.id === id);
    if (!note) return;
    editingNoteId = id;
    document.getElementById('soapModalTitle').textContent = 'Edit SOAP Note';
    document.getElementById('soapPatient').value         = note.patient_id || '';
    document.getElementById('soapSubjective').value      = note.subjective || '';
    document.getElementById('soapObjective').value       = note.objective || '';
    document.getElementById('soapAssessment').value      = note.assessment || '';
    document.getElementById('soapPlan').value            = note.plan || '';
    document.getElementById('soapDiagnosisCodes').value  = note.diagnosis_codes || note.icd_codes || '';
    document.getElementById('soapProcedureCodes').value  = note.procedure_codes || note.cpt_codes || '';
    // Load appointments for the patient then set value
    onPatientChange().then(() => {
      document.getElementById('soapAppointment').value = note.appointment_id || '';
    });
    openModal('soapModal');
  }

  // ── Patient change → load appointments ─────────────────────────────────────
  async function onPatientChange() {
    const patientId = document.getElementById('soapPatient')?.value;
    const sel = document.getElementById('soapAppointment');
    sel.innerHTML = '<option value="">Select appointment (optional)...</option>';
    if (!patientId) return;
    try {
      const appts = await window.api.appointments.getByPatient(parseInt(patientId));
      appts.sort((a, b) => new Date(b.date + 'T' + (b.time || '00:00')) - new Date(a.date + 'T' + (a.time || '00:00')));
      appts.forEach(a => {
        const label = `${formatDate(a.date)} ${a.time ? formatTime(a.time) : ''} — ${(a.type || '').replace(/-/g,' ')}`;
        sel.innerHTML += `<option value="${a.id}">${label}</option>`;
      });
    } catch (_) {}
  }

  // ── Save SOAP Note ──────────────────────────────────────────────────────────
  async function save() {
    const patientId = document.getElementById('soapPatient').value;
    if (!patientId) { toast('Please select a patient', 'warning'); return; }

    const data = {
      patient_id:       parseInt(patientId),
      appointment_id:   document.getElementById('soapAppointment').value ? parseInt(document.getElementById('soapAppointment').value) : null,
      subjective:       document.getElementById('soapSubjective').value.trim() || null,
      objective:        document.getElementById('soapObjective').value.trim() || null,
      assessment:       document.getElementById('soapAssessment').value.trim() || null,
      plan:             document.getElementById('soapPlan').value.trim() || null,
      diagnosis_codes:  document.getElementById('soapDiagnosisCodes').value.trim() || null,
      procedure_codes:  document.getElementById('soapProcedureCodes').value.trim() || null,
      note_date:        todayString()
    };

    const btn = document.getElementById('soapModalSave');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
      if (editingNoteId) {
        await window.api.soap.update(editingNoteId, data);
        toast('SOAP note updated', 'success');
      } else {
        await window.api.soap.create(data);
        toast('SOAP note created', 'success');
      }
      closeModal('soapModal');
      await loadNotes();
      if (editingNoteId && currentNote) {
        openDetail(editingNoteId);
      }
    } catch (err) {
      console.error(err);
      toast('Failed to save SOAP note', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save SOAP Note';
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function deleteNote(id) {
    const confirmed = await confirm('Delete this SOAP note? This cannot be undone.', 'Delete', 'btn-danger');
    if (!confirmed) return;
    try {
      await window.api.soap.delete(id);
      toast('SOAP note deleted', 'success');
      await loadNotes();
      if (viewMode === 'detail') showListView();
    } catch (err) {
      toast('Failed to delete SOAP note', 'error');
    }
  }

  // ── Print ───────────────────────────────────────────────────────────────────
  function printSOAP(note) {
    if (!note) note = currentNote;
    if (!note) return;

    const diagCodes = (note.diagnosis_codes || note.icd_codes || '').split(',').map(c => c.trim()).filter(Boolean);
    const procCodes = (note.procedure_codes || note.cpt_codes || '').split(',').map(c => c.trim()).filter(Boolean);
    const apptType  = note.appointment_type || note.appt_type || '—';
    const createdBy = note.created_by_name || note.created_by || '—';

    const formatSection = (letter, label, content) => `
      <div style="margin-bottom:22px;page-break-inside:avoid;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;border-bottom:2px solid #c9a227;padding-bottom:6px;">
          <div style="width:28px;height:28px;border-radius:50%;background:#c9a227;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:14px;color:#000;flex-shrink:0;">${letter}</div>
          <div style="font-weight:800;font-size:15px;color:#1a1a1a;">${label}</div>
        </div>
        <div style="padding:10px 14px;background:#fafafa;border-left:3px solid #c9a227;font-size:13px;line-height:1.8;color:#333;white-space:pre-wrap;min-height:40px;">
          ${content ? content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '<em style="color:#999;">Not recorded</em>'}
        </div>
      </div>
    `;

    const win = window.open('', '_blank', 'width=800,height=900');
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>SOAP Note — ${note.first_name || ''} ${note.last_name || ''}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #222; background: #fff; padding: 30px 40px; }
    .print-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 3px solid #c9a227; }
    .clinic-name { font-size: 22px; font-weight: 900; color: #1a1a1a; }
    .clinic-sub { font-size: 12px; color: #666; margin-top: 3px; }
    .note-title { font-size: 18px; font-weight: 800; color: #c9a227; text-align: right; }
    .note-meta { font-size: 12px; color: #666; text-align: right; margin-top: 4px; }
    .patient-bar { background: #f5f5f5; border: 1px solid #ddd; border-radius: 6px; padding: 12px 16px; margin-bottom: 22px; display: flex; gap: 40px; }
    .patient-bar .field-label { font-size: 10px; text-transform: uppercase; color: #999; font-weight: 700; margin-bottom: 2px; }
    .patient-bar .field-value { font-size: 14px; font-weight: 600; color: #222; }
    .codes-bar { display: flex; gap: 20px; margin-bottom: 22px; }
    .codes-section { flex: 1; padding: 10px 14px; background: #fffbf0; border: 1px solid #e8d78a; border-radius: 5px; }
    .codes-label { font-size: 10px; text-transform: uppercase; color: #999; font-weight: 700; margin-bottom: 6px; }
    .code-chip { display: inline-block; background: #fff3cc; border: 1px solid #c9a227; color: #7a5f00; padding: 2px 8px; border-radius: 4px; font-family: monospace; font-size: 12px; margin: 2px 3px 2px 0; }
    .footer { margin-top: 30px; padding-top: 14px; border-top: 1px solid #e0e0e0; font-size: 11px; color: #999; text-align: center; }
    @media print { body { padding: 15px 20px; } @page { margin: 0.5in; } }
  </style>
</head>
<body>
  <div class="print-header">
    <div>
      <div class="clinic-name">Walden Bailey Chiropractic</div>
      <div class="clinic-sub">Buffalo, NY &bull; (716) 555-0100</div>
    </div>
    <div>
      <div class="note-title">SOAP NOTE</div>
      <div class="note-meta">${formatDate(note.note_date || note.created_at)}</div>
    </div>
  </div>

  <div class="patient-bar">
    <div>
      <div class="field-label">Patient</div>
      <div class="field-value">${note.first_name || ''} ${note.last_name || ''}</div>
    </div>
    <div>
      <div class="field-label">Appointment Type</div>
      <div class="field-value" style="text-transform:capitalize;">${apptType}</div>
    </div>
    <div>
      <div class="field-label">Treating Provider</div>
      <div class="field-value">${createdBy}</div>
    </div>
    <div>
      <div class="field-label">Note Date</div>
      <div class="field-value">${formatDate(note.note_date || note.created_at)}</div>
    </div>
  </div>

  ${(diagCodes.length || procCodes.length) ? `
  <div class="codes-bar">
    ${diagCodes.length ? `<div class="codes-section">
      <div class="codes-label">ICD-10 Diagnosis Codes</div>
      ${diagCodes.map(c => `<span class="code-chip">${c}</span>`).join('')}
    </div>` : ''}
    ${procCodes.length ? `<div class="codes-section">
      <div class="codes-label">CPT Procedure Codes</div>
      ${procCodes.map(c => `<span class="code-chip">${c}</span>`).join('')}
    </div>` : ''}
  </div>` : ''}

  ${formatSection('S', 'Subjective — Patient\'s Description of Symptoms', note.subjective)}
  ${formatSection('O', 'Objective — Measurable Findings', note.objective)}
  ${formatSection('A', 'Assessment — Diagnosis / Clinical Impression', note.assessment)}
  ${formatSection('P', 'Plan — Treatment Plan', note.plan)}

  <div class="footer">
    This document is confidential and protected under HIPAA regulations. &bull; Walden Bailey Chiropractic &bull; Printed ${new Date().toLocaleString('en-US')}
  </div>

  <script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`);
    win.document.close();
  }

  // ── Bind Events ─────────────────────────────────────────────────────────────
  function bindEvents() {
    document.getElementById('newSoapBtn')?.addEventListener('click', openNew);
    document.getElementById('soapSearch')?.addEventListener('input', () => {
      clearTimeout(window._soapSearchTimer);
      window._soapSearchTimer = setTimeout(renderTable, 200);
    });
    document.getElementById('soapBackBtn')?.addEventListener('click', showListView);
    document.getElementById('soapPrintBtn')?.addEventListener('click', () => printSOAP(currentNote));
    document.getElementById('soapEditBtn')?.addEventListener('click', () => { if (currentNote) openEdit(currentNote.id); });
    document.getElementById('soapDeleteBtn')?.addEventListener('click', () => { if (currentNote) deleteNote(currentNote.id); });
    document.getElementById('soapModalSave')?.addEventListener('click', save);
    document.getElementById('soapPatient')?.addEventListener('change', onPatientChange);
    setupModalClose('soapModal', ['soapModalClose', 'soapModalCancel']);
  }

  return {
    render,
    openDetail,
    openEdit,
    deleteNote,
    printSOAP,
    refresh: loadNotes
  };
})();
