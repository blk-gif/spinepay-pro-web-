'use strict';

// ── Intake Forms Module ───────────────────────────────────────────────────────
window.IntakeForms = (() => {
  const { toast, confirm, openModal, closeModal, setupModalClose,
          formatDate, getCurrentUser, todayString } = window.App;

  let allForms    = [];
  let allPatients = [];

  const MEDICAL_CONDITIONS = [
    'Heart Disease', 'Diabetes', 'High Blood Pressure', 'Arthritis',
    'Osteoporosis', 'Cancer', 'Fibromyalgia', 'Previous Surgeries',
    'Chronic Pain', 'Anxiety/Depression', 'Asthma', 'Thyroid Disorder'
  ];

  // ── Build HTML ──────────────────────────────────────────────────────────────
  function buildHTML() {
    return `
      <div class="card card-gold">
        <div class="filter-bar">
          <div class="filter-search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" class="form-control" id="intakeSearch" placeholder="Search by patient name..." />
          </div>
          <select class="form-control" id="intakeSignedFilter" style="width:140px;">
            <option value="">All Forms</option>
            <option value="1">Signed</option>
            <option value="0">Unsigned</option>
          </select>
          <div style="flex:1;"></div>
          <button class="btn btn-primary btn-sm" id="newIntakeBtn">
            <i class="fa-solid fa-plus"></i> New Intake Form
          </button>
        </div>
        <div class="table-wrapper">
          <table id="intakeTable">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Date</th>
                <th>Reason for Visit</th>
                <th>HIPAA Signed</th>
                <th style="width:110px;">Actions</th>
              </tr>
            </thead>
            <tbody id="intakeTableBody">
              <tr><td colspan="5"><div class="table-empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading...</p></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Intake Form Modal -->
      <div class="modal-overlay" id="intakeModal">
        <div class="modal modal-xl" style="max-width:860px;">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-clipboard-list"></i> Patient Intake Form</div>
            <button class="modal-close" id="intakeModalClose">&times;</button>
          </div>
          <div class="modal-body" style="max-height:78vh;overflow-y:auto;">
            <form id="intakeForm">
              <!-- Patient selector -->
              <div class="form-group" style="margin-bottom:20px;">
                <label class="form-label">Select Patient <span class="required">*</span></label>
                <select class="form-control" id="intakePatientSelect" required>
                  <option value="">Select patient...</option>
                </select>
              </div>

              <!-- Section 1: Personal Information -->
              <div class="intake-section-title">
                <i class="fa-solid fa-user" style="color:var(--gold);margin-right:8px;"></i>1. Personal Information
              </div>
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label">Full Name <span class="required">*</span></label>
                  <input type="text" class="form-control" id="intakeFullName" required placeholder="First Last" />
                </div>
                <div class="form-group">
                  <label class="form-label">Date of Birth</label>
                  <input type="date" class="form-control" id="intakeDob" />
                </div>
                <div class="form-group">
                  <label class="form-label">Gender</label>
                  <select class="form-control" id="intakeGender">
                    <option value="">Prefer not to say</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="non-binary">Non-binary</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Phone</label>
                  <input type="tel" class="form-control" id="intakePhone" placeholder="(716) 555-0000" />
                </div>
                <div class="form-group">
                  <label class="form-label">Email</label>
                  <input type="email" class="form-control" id="intakeEmail" placeholder="email@example.com" />
                </div>
                <div class="form-group">
                  <label class="form-label">Address</label>
                  <input type="text" class="form-control" id="intakeAddress" placeholder="123 Main St, Buffalo, NY 14201" />
                </div>
              </div>

              <!-- Section 2: Insurance Information -->
              <div class="intake-section-title" style="margin-top:20px;">
                <i class="fa-solid fa-shield-halved" style="color:var(--gold);margin-right:8px;"></i>2. Insurance Information
              </div>
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label">Insurance Provider</label>
                  <input type="text" class="form-control" id="intakeInsuranceProvider" placeholder="BlueCross, Aetna, Medicare..." />
                </div>
                <div class="form-group">
                  <label class="form-label">Policy Number</label>
                  <input type="text" class="form-control" id="intakePolicyNumber" placeholder="Policy #" />
                </div>
                <div class="form-group">
                  <label class="form-label">Group Number</label>
                  <input type="text" class="form-control" id="intakeGroupNumber" placeholder="Group #" />
                </div>
              </div>

              <!-- Section 3: Medical History -->
              <div class="intake-section-title" style="margin-top:20px;">
                <i class="fa-solid fa-heart-pulse" style="color:var(--gold);margin-right:8px;"></i>3. Medical History
              </div>
              <div style="margin-bottom:6px;font-size:12px;color:var(--text-muted);">Check all that apply:</div>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;padding:14px;background:var(--bg-mid);border-radius:var(--radius-sm);border:1px solid var(--border);margin-bottom:16px;">
                ${MEDICAL_CONDITIONS.map(cond => `
                  <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--text-secondary);">
                    <input type="checkbox" class="intake-condition-chk" value="${cond}"
                      style="width:15px;height:15px;accent-color:var(--gold);cursor:pointer;" />
                    ${cond}
                  </label>
                `).join('')}
              </div>

              <!-- Section 4: Current Medications -->
              <div class="intake-section-title" style="margin-top:4px;">
                <i class="fa-solid fa-pills" style="color:var(--gold);margin-right:8px;"></i>4. Current Medications
              </div>
              <div class="form-group">
                <textarea class="form-control" id="intakeMedications" rows="3" placeholder="List all current medications including dosage (e.g. Ibuprofen 400mg twice daily)..."></textarea>
              </div>

              <!-- Section 5: Allergies -->
              <div class="intake-section-title" style="margin-top:4px;">
                <i class="fa-solid fa-triangle-exclamation" style="color:var(--gold);margin-right:8px;"></i>5. Allergies
              </div>
              <div class="form-group">
                <textarea class="form-control" id="intakeAllergies" rows="2" placeholder="Drug, food, or environmental allergies (e.g. Penicillin, Latex, Peanuts, NKDA)..."></textarea>
              </div>

              <!-- Section 6: Reason for Visit -->
              <div class="intake-section-title" style="margin-top:4px;">
                <i class="fa-solid fa-stethoscope" style="color:var(--gold);margin-right:8px;"></i>6. Reason for Visit <span class="required">*</span>
              </div>
              <div class="form-group">
                <textarea class="form-control" id="intakeReasonForVisit" rows="4" required
                  placeholder="Describe your main complaint, where it hurts, when it started, and what makes it better or worse..."></textarea>
              </div>

              <!-- Section 7: HIPAA Acknowledgment -->
              <div class="intake-section-title" style="margin-top:4px;">
                <i class="fa-solid fa-lock" style="color:var(--gold);margin-right:8px;"></i>7. HIPAA Privacy Acknowledgment
              </div>
              <div style="padding:14px;background:rgba(212,175,55,0.07);border:1px solid rgba(212,175,55,0.2);border-radius:var(--radius-sm);margin-bottom:16px;">
                <p style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;line-height:1.6;">
                  Walden Bailey Chiropractic is committed to protecting your health information. Our Notice of Privacy Practices describes how we may use and disclose your protected health information for treatment, payment, and healthcare operations. You have the right to review this notice prior to signing.
                </p>
                <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;">
                  <input type="checkbox" id="intakeHipaaAck" style="width:16px;height:16px;accent-color:var(--gold);cursor:pointer;margin-top:2px;flex-shrink:0;" />
                  <span style="font-size:13px;color:var(--text-primary);font-weight:500;">
                    I acknowledge receipt of the HIPAA Privacy Notice and consent to the use of my health information as described therein.
                  </span>
                </label>
              </div>

              <!-- Section 8: Signature -->
              <div class="intake-section-title" style="margin-top:4px;">
                <i class="fa-solid fa-signature" style="color:var(--gold);margin-right:8px;"></i>8. Patient Signature
              </div>
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label">Typed Signature (Full Legal Name) <span class="required">*</span></label>
                  <input type="text" class="form-control" id="intakeSignature" required placeholder="Type your full legal name to sign"
                    style="font-style:italic;font-size:16px;font-family:Georgia,serif;" />
                </div>
                <div class="form-group">
                  <label class="form-label">Date of Signature</label>
                  <input type="date" class="form-control" id="intakeSignatureDate" />
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="intakeModalCancel">Cancel</button>
            <button class="btn btn-outline btn-sm" id="intakePrintModalBtn" style="margin-right:auto;">
              <i class="fa-solid fa-print"></i> Print Blank Form
            </button>
            <button class="btn btn-primary" id="intakeModalSave">
              <i class="fa-solid fa-floppy-disk"></i> Submit Intake Form
            </button>
          </div>
        </div>
      </div>

      <!-- View Intake Modal -->
      <div class="modal-overlay" id="intakeViewModal">
        <div class="modal modal-lg">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-clipboard-list"></i> Intake Form — <span id="intakeViewPatientName"></span></div>
            <button class="modal-close" id="intakeViewModalClose">&times;</button>
          </div>
          <div class="modal-body" id="intakeViewBody" style="max-height:76vh;overflow-y:auto;"></div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="intakeViewModalCancel">Close</button>
            <button class="btn btn-outline btn-sm" id="intakeViewPrintBtn">
              <i class="fa-solid fa-print"></i> Print
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  async function render() {
    const view = document.getElementById('view-intake');
    if (!view.querySelector('.card')) {
      view.innerHTML = buildHTML();
      bindEvents();
    }
    allPatients = await window.api.patients.getAll();
    populatePatientSelect();
    await loadForms();
  }

  async function loadForms() {
    try {
      let forms = [];
      try {
        forms = await window.api.intake.getAll();
      } catch (_) {
        const results = await Promise.all(
          allPatients.map(p => window.api.intake.getByPatient(p.id).catch(() => []))
        );
        forms = results.flat();
      }
      allForms = forms;
      renderTable();
    } catch (err) {
      console.error(err);
      toast('Failed to load intake forms', 'error');
    }
  }

  function populatePatientSelect() {
    const sorted = [...allPatients].sort((a, b) => a.last_name.localeCompare(b.last_name));
    const opts = '<option value="">Select patient...</option>' +
      sorted.map(p => `<option value="${p.id}" data-first="${p.first_name}" data-last="${p.last_name}" data-dob="${p.dob||''}" data-phone="${p.phone||''}" data-email="${p.email||''}" data-address="${p.address||''}">${p.last_name}, ${p.first_name}</option>`).join('');
    const sel = document.getElementById('intakePatientSelect');
    if (sel) sel.innerHTML = opts;
  }

  // ── Auto-fill personal info when patient selected ──────────────────────────
  function onPatientSelectChange() {
    const sel = document.getElementById('intakePatientSelect');
    if (!sel || !sel.value) return;
    const opt = sel.options[sel.selectedIndex];
    const first = opt.dataset.first || '';
    const last  = opt.dataset.last  || '';
    const dob   = opt.dataset.dob   || '';
    const phone = opt.dataset.phone || '';
    const email = opt.dataset.email || '';
    const addr  = opt.dataset.address || '';

    const el = id => document.getElementById(id);
    if (el('intakeFullName'))  el('intakeFullName').value  = `${first} ${last}`.trim();
    if (el('intakeDob'))       el('intakeDob').value       = dob;
    if (el('intakePhone'))     el('intakePhone').value     = phone;
    if (el('intakeEmail'))     el('intakeEmail').value     = email;
    if (el('intakeAddress'))   el('intakeAddress').value   = addr;
  }

  // ── Table ───────────────────────────────────────────────────────────────────
  function renderTable() {
    const search  = (document.getElementById('intakeSearch')?.value || '').toLowerCase();
    const signed  = document.getElementById('intakeSignedFilter')?.value;

    let filtered = allForms.filter(f => {
      const name = `${f.first_name || ''} ${f.last_name || ''}`.toLowerCase();
      const matchSearch = !search || name.includes(search);
      const matchSigned = signed === '' ? true : (String(f.hipaa_acknowledged || f.signed || 0) === signed);
      return matchSearch && matchSigned;
    });

    filtered = filtered.sort((a, b) => new Date(b.submitted_at || b.created_at || 0) - new Date(a.submitted_at || a.created_at || 0));

    const tbody = document.getElementById('intakeTableBody');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="table-empty"><i class="fa-solid fa-clipboard"></i><p>No intake forms found</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(f => {
      const isSigned = f.hipaa_acknowledged || f.signed;
      const signedBadge = isSigned
        ? `<span class="badge badge-active"><i class="fa-solid fa-check" style="margin-right:4px;"></i>Signed</span>`
        : `<span class="badge badge-pending">Unsigned</span>`;
      const reason = (f.reason_for_visit || '').substring(0, 60) + ((f.reason_for_visit || '').length > 60 ? '…' : '');
      return `<tr>
        <td class="td-primary">${f.first_name || ''} ${f.last_name || ''}</td>
        <td>${formatDate(f.submitted_at || f.created_at)}</td>
        <td style="font-size:13px;color:var(--text-secondary);">${reason || '—'}</td>
        <td>${signedBadge}</td>
        <td onclick="event.stopPropagation()">
          <div class="action-row" style="gap:4px;">
            <button class="btn btn-icon btn-sm btn-outline" title="View" onclick="window.IntakeForms.viewForm(${f.id})">
              <i class="fa-solid fa-eye"></i>
            </button>
            <button class="btn btn-icon btn-sm btn-outline" title="Print" onclick="window.IntakeForms.printForm(${f.id})">
              <i class="fa-solid fa-print"></i>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // ── Open New Intake Modal ───────────────────────────────────────────────────
  function openNew() {
    document.getElementById('intakeForm').reset();
    document.getElementById('intakeSignatureDate').value = todayString();
    // Uncheck all condition checkboxes
    document.querySelectorAll('.intake-condition-chk').forEach(chk => { chk.checked = false; });
    openModal('intakeModal');
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  async function save() {
    const patientId  = document.getElementById('intakePatientSelect').value;
    const reason     = document.getElementById('intakeReasonForVisit').value.trim();
    const signature  = document.getElementById('intakeSignature').value.trim();

    if (!patientId) { toast('Please select a patient', 'warning'); return; }
    if (!reason)    { toast('Please provide a reason for visit', 'warning'); return; }
    if (!signature) { toast('Please provide a signature', 'warning'); return; }

    // Collect checked conditions
    const conditions = [];
    document.querySelectorAll('.intake-condition-chk:checked').forEach(chk => conditions.push(chk.value));

    const data = {
      patient_id:           parseInt(patientId),
      full_name:            document.getElementById('intakeFullName').value.trim() || null,
      dob:                  document.getElementById('intakeDob').value || null,
      gender:               document.getElementById('intakeGender').value || null,
      address:              document.getElementById('intakeAddress').value.trim() || null,
      phone:                document.getElementById('intakePhone').value.trim() || null,
      email:                document.getElementById('intakeEmail').value.trim() || null,
      insurance_provider:   document.getElementById('intakeInsuranceProvider').value.trim() || null,
      policy_number:        document.getElementById('intakePolicyNumber').value.trim() || null,
      group_number:         document.getElementById('intakeGroupNumber').value.trim() || null,
      medical_history:      conditions.join(', ') || null,
      current_medications:  document.getElementById('intakeMedications').value.trim() || null,
      allergies:            document.getElementById('intakeAllergies').value.trim() || null,
      reason_for_visit:     reason,
      hipaa_acknowledged:   document.getElementById('intakeHipaaAck').checked ? 1 : 0,
      signature:            signature,
      signature_date:       document.getElementById('intakeSignatureDate').value || todayString(),
      submitted_at:         todayString()
    };

    const btn = document.getElementById('intakeModalSave');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
      await window.api.intake.create(data);
      toast('Intake form submitted successfully', 'success');
      closeModal('intakeModal');
      await loadForms();
    } catch (err) {
      console.error(err);
      toast('Failed to save intake form', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Submit Intake Form';
    }
  }

  // ── View Form ───────────────────────────────────────────────────────────────
  function viewForm(id) {
    const form = allForms.find(f => f.id === id);
    if (!form) return;

    document.getElementById('intakeViewPatientName').textContent = `${form.first_name || ''} ${form.last_name || ''}`;

    const body = document.getElementById('intakeViewBody');
    body.innerHTML = buildViewHTML(form);

    // Wire the print button to this specific form
    document.getElementById('intakeViewPrintBtn').onclick = () => printForm(id);

    openModal('intakeViewModal');
  }

  function buildViewHTML(form) {
    const field = (label, value) => value ? `
      <div style="margin-bottom:12px;">
        <div style="font-size:10px;text-transform:uppercase;color:var(--text-muted);font-weight:700;letter-spacing:0.5px;margin-bottom:3px;">${label}</div>
        <div style="font-size:14px;color:var(--text-primary);">${escapeHtml(String(value))}</div>
      </div>` : '';

    const conditions = (form.medical_history || '').split(',').map(c => c.trim()).filter(Boolean);

    return `
      <div style="padding:4px 8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid var(--border);">
          <div>
            <div style="font-size:18px;font-weight:800;color:var(--text-primary);">${form.first_name || ''} ${form.last_name || ''}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:3px;">Submitted: ${formatDate(form.submitted_at || form.created_at)}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            ${form.hipaa_acknowledged
              ? `<span class="badge badge-active"><i class="fa-solid fa-shield-check" style="margin-right:5px;"></i>HIPAA Signed</span>`
              : `<span class="badge badge-pending">HIPAA Not Signed</span>`}
          </div>
        </div>

        <div class="intake-section-title"><i class="fa-solid fa-user" style="color:var(--gold);margin-right:8px;"></i>Personal Information</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 20px;margin-bottom:20px;">
          ${field('Full Name', form.full_name)}
          ${field('Date of Birth', form.dob ? formatDate(form.dob) : null)}
          ${field('Gender', form.gender)}
          ${field('Phone', form.phone)}
          ${field('Email', form.email)}
          ${field('Address', form.address)}
        </div>

        <div class="intake-section-title"><i class="fa-solid fa-shield-halved" style="color:var(--gold);margin-right:8px;"></i>Insurance Information</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 20px;margin-bottom:20px;">
          ${field('Provider', form.insurance_provider)}
          ${field('Policy Number', form.policy_number)}
          ${field('Group Number', form.group_number)}
        </div>

        <div class="intake-section-title"><i class="fa-solid fa-heart-pulse" style="color:var(--gold);margin-right:8px;"></i>Medical History</div>
        <div style="margin-bottom:20px;">
          ${conditions.length > 0
            ? `<div style="display:flex;flex-wrap:wrap;gap:6px;">${conditions.map(c => `<span style="background:rgba(212,175,55,0.15);border:1px solid rgba(212,175,55,0.3);color:var(--gold);padding:4px 10px;border-radius:20px;font-size:12px;">${escapeHtml(c)}</span>`).join('')}</div>`
            : `<span style="color:var(--text-muted);font-size:13px;font-style:italic;">No conditions reported</span>`}
        </div>

        ${form.current_medications ? `
        <div class="intake-section-title"><i class="fa-solid fa-pills" style="color:var(--gold);margin-right:8px;"></i>Current Medications</div>
        <div style="padding:12px 14px;background:var(--bg-mid);border-radius:var(--radius-sm);border:1px solid var(--border);margin-bottom:20px;font-size:13px;color:var(--text-secondary);white-space:pre-wrap;">${escapeHtml(form.current_medications)}</div>
        ` : ''}

        ${form.allergies ? `
        <div class="intake-section-title"><i class="fa-solid fa-triangle-exclamation" style="color:var(--gold);margin-right:8px;"></i>Allergies</div>
        <div style="padding:12px 14px;background:rgba(231,76,60,0.07);border-radius:var(--radius-sm);border:1px solid rgba(231,76,60,0.2);margin-bottom:20px;font-size:13px;color:var(--text-secondary);white-space:pre-wrap;">${escapeHtml(form.allergies)}</div>
        ` : ''}

        <div class="intake-section-title"><i class="fa-solid fa-stethoscope" style="color:var(--gold);margin-right:8px;"></i>Reason for Visit</div>
        <div style="padding:12px 14px;background:var(--bg-mid);border-radius:var(--radius-sm);border-left:3px solid var(--gold);margin-bottom:20px;font-size:13px;color:var(--text-secondary);white-space:pre-wrap;line-height:1.7;">${escapeHtml(form.reason_for_visit || '—')}</div>

        ${form.signature ? `
        <div class="intake-section-title"><i class="fa-solid fa-signature" style="color:var(--gold);margin-right:8px;"></i>Signature</div>
        <div style="padding:12px 14px;background:var(--bg-mid);border-radius:var(--radius-sm);border:1px solid var(--border);margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-style:italic;font-size:16px;font-family:Georgia,serif;color:var(--text-primary);">${escapeHtml(form.signature)}</span>
          <span style="font-size:12px;color:var(--text-muted);">${form.signature_date ? formatDate(form.signature_date) : ''}</span>
        </div>
        ` : ''}
      </div>
    `;
  }

  // ── Print Form ──────────────────────────────────────────────────────────────
  function printForm(id) {
    const form = allForms.find(f => f.id === id);
    if (!form) return;
    _printIntakeWindow(form);
  }

  function _printIntakeWindow(form) {
    const conditions = (form.medical_history || '').split(',').map(c => c.trim()).filter(Boolean);

    const condGrid = MEDICAL_CONDITIONS.map(cond => `
      <div style="display:flex;align-items:center;gap:6px;padding:5px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;">
        <span style="width:14px;height:14px;border:1px solid #999;border-radius:2px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;color:${conditions.includes(cond) ? '#c9a227' : 'transparent'};">
          ${conditions.includes(cond) ? '✓' : '&nbsp;'}
        </span>
        ${cond}
      </div>
    `).join('');

    const win = window.open('', '_blank', 'width=800,height=1000');
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Intake Form — ${form.first_name || ''} ${form.last_name || ''}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #222; background: #fff; padding: 28px 36px; font-size: 13px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 3px solid #c9a227; }
    .clinic-name { font-size: 20px; font-weight: 900; }
    .clinic-sub { color: #666; font-size: 12px; margin-top: 3px; }
    .form-title { font-size: 18px; font-weight: 800; color: #c9a227; text-align: right; }
    .section-title { font-size: 13px; font-weight: 800; text-transform: uppercase; color: #c9a227; letter-spacing: 0.5px; border-bottom: 1px solid #e8d78a; padding-bottom: 5px; margin: 18px 0 10px; }
    .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0 20px; margin-bottom: 4px; }
    .field { margin-bottom: 10px; }
    .field-label { font-size: 10px; text-transform: uppercase; color: #999; font-weight: 700; margin-bottom: 2px; }
    .field-value { font-size: 13px; color: #111; border-bottom: 1px solid #ddd; padding-bottom: 3px; min-height: 20px; }
    .cond-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 14px; }
    .text-block { border: 1px solid #ddd; border-radius: 4px; padding: 8px 10px; min-height: 60px; font-size: 12px; color: #333; white-space: pre-wrap; }
    .sig-box { border: 1px solid #ddd; border-radius: 4px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; }
    .sig-name { font-style: italic; font-family: Georgia, serif; font-size: 16px; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #eee; font-size: 10px; color: #999; text-align: center; }
    @media print { body { padding: 10px 15px; } @page { margin: 0.4in; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="clinic-name">Walden Bailey Chiropractic</div>
      <div class="clinic-sub">Buffalo, NY &bull; (716) 555-0100</div>
    </div>
    <div>
      <div class="form-title">PATIENT INTAKE FORM</div>
      <div style="font-size:11px;color:#666;text-align:right;margin-top:4px;">Date: ${formatDate(form.submitted_at || form.created_at)}</div>
    </div>
  </div>

  <div class="section-title">1. Personal Information</div>
  <div class="field-row">
    <div class="field"><div class="field-label">Full Name</div><div class="field-value">${form.full_name || ''}</div></div>
    <div class="field"><div class="field-label">Date of Birth</div><div class="field-value">${form.dob ? formatDate(form.dob) : ''}</div></div>
  </div>
  <div class="field-row">
    <div class="field"><div class="field-label">Gender</div><div class="field-value" style="text-transform:capitalize;">${form.gender || ''}</div></div>
    <div class="field"><div class="field-label">Phone</div><div class="field-value">${form.phone || ''}</div></div>
  </div>
  <div class="field-row">
    <div class="field"><div class="field-label">Email</div><div class="field-value">${form.email || ''}</div></div>
    <div class="field"><div class="field-label">Address</div><div class="field-value">${form.address || ''}</div></div>
  </div>

  <div class="section-title">2. Insurance Information</div>
  <div class="field-row">
    <div class="field"><div class="field-label">Insurance Provider</div><div class="field-value">${form.insurance_provider || ''}</div></div>
    <div class="field"><div class="field-label">Policy Number</div><div class="field-value">${form.policy_number || ''}</div></div>
  </div>
  <div class="field"><div class="field-label">Group Number</div><div class="field-value">${form.group_number || ''}</div></div>

  <div class="section-title">3. Medical History (check all that apply)</div>
  <div class="cond-grid">${condGrid}</div>

  <div class="section-title">4. Current Medications</div>
  <div class="text-block">${form.current_medications || ''}</div>

  <div class="section-title">5. Allergies</div>
  <div class="text-block">${form.allergies || ''}</div>

  <div class="section-title">6. Reason for Visit</div>
  <div class="text-block">${form.reason_for_visit || ''}</div>

  <div class="section-title">7. HIPAA Acknowledgment</div>
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;font-size:12px;">
    <span style="width:14px;height:14px;border:1px solid #999;border-radius:2px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;color:${form.hipaa_acknowledged ? '#c9a227' : 'transparent'};">${form.hipaa_acknowledged ? '✓' : '&nbsp;'}</span>
    I acknowledge receipt of the HIPAA Privacy Notice and consent to the use of my health information.
  </div>

  <div class="section-title">8. Patient Signature</div>
  <div class="sig-box">
    <div>
      <div style="font-size:10px;color:#999;margin-bottom:4px;">Patient Signature</div>
      <div class="sig-name">${form.signature || ''}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:10px;color:#999;margin-bottom:4px;">Date</div>
      <div>${form.signature_date ? formatDate(form.signature_date) : ''}</div>
    </div>
  </div>

  <div class="footer">
    This document contains protected health information (PHI). Handle in accordance with HIPAA regulations. &bull; Walden Bailey Chiropractic
  </div>

  <script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`);
    win.document.close();
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Bind Events ─────────────────────────────────────────────────────────────
  function bindEvents() {
    document.getElementById('newIntakeBtn')?.addEventListener('click', openNew);
    document.getElementById('intakeSearch')?.addEventListener('input', () => {
      clearTimeout(window._intakeSearchTimer);
      window._intakeSearchTimer = setTimeout(renderTable, 200);
    });
    document.getElementById('intakeSignedFilter')?.addEventListener('change', renderTable);
    document.getElementById('intakePatientSelect')?.addEventListener('change', onPatientSelectChange);
    document.getElementById('intakeModalSave')?.addEventListener('click', save);
    document.getElementById('intakePrintModalBtn')?.addEventListener('click', () => {
      // Print a blank form (create a minimal empty form object)
      _printIntakeWindow({});
    });
    setupModalClose('intakeModal',     ['intakeModalClose', 'intakeModalCancel']);
    setupModalClose('intakeViewModal', ['intakeViewModalClose', 'intakeViewModalCancel']);
  }

  return {
    render,
    viewForm,
    printForm,
    refresh: loadForms
  };
})();
