'use strict';

// ── Referrals Module ─────────────────────────────────────────────────────────
window.Referrals = (() => {
  const { toast, confirm, statusBadge, openModal, closeModal, formatDate, formatCurrency } = window.App;

  let allReferrals = [];
  let allPatients  = [];
  let editingReferralId = null;

  const REFERRAL_TYPES = ['attorney', 'doctor', 'specialist'];
  const REFERRAL_STATUSES = ['pending', 'sent', 'acknowledged', 'completed'];

  // ── Build HTML ─────────────────────────────────────────────────────────────
  function buildReferralsHTML() {
    return `
      <div class="section-header mb-16">
        <div class="section-title">Referral <span>Management</span></div>
        <button class="btn btn-primary" id="newReferralBtn">
          <i class="fa-solid fa-plus"></i> New Referral
        </button>
      </div>

      <div class="card card-gold">
        <div class="filter-bar">
          <div class="filter-search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" class="form-control" id="referralSearch" placeholder="Search patient, recipient..." />
          </div>
          <select class="form-control" id="referralTypeFilter" style="width:140px;">
            <option value="">All Types</option>
            ${REFERRAL_TYPES.map(t => `<option value="${t}">${t.charAt(0).toUpperCase()+t.slice(1)}</option>`).join('')}
          </select>
          <select class="form-control" id="referralStatusFilter" style="width:140px;">
            <option value="">All Status</option>
            ${REFERRAL_STATUSES.map(s => `<option value="${s}">${s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('')}
          </select>
          <span class="text-muted" id="referralCount" style="font-size:12px;white-space:nowrap;"></span>
        </div>

        <div class="table-wrapper">
          <table id="referralsTable">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Type</th>
                <th>Recipient</th>
                <th>Contact</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Sent Date</th>
                <th>Created</th>
                <th style="width:140px;">Actions</th>
              </tr>
            </thead>
            <tbody id="referralsTableBody">
              <tr><td colspan="9"><div class="table-empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading...</p></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Referral Detail Panel -->
      <div id="referralDetailPanel" class="hidden mt-20">
        <div class="section-header mb-12">
          <div class="section-title">Referral <span>Details</span></div>
          <button class="btn btn-secondary btn-sm" id="closeReferralDetail">
            <i class="fa-solid fa-xmark"></i> Close
          </button>
        </div>
        <div id="referralDetailContent" class="card card-gold">
          <div class="card-body"></div>
        </div>
      </div>

      <!-- New / Edit Referral Modal -->
      <div class="modal-overlay" id="referralModal">
        <div class="modal modal-lg">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-share-nodes"></i> <span id="referralModalTitle">New Referral</span></div>
            <button class="modal-close" id="referralModalClose">&times;</button>
          </div>
          <div class="modal-body">
            <form id="referralForm">
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label">Patient <span class="required">*</span></label>
                  <select class="form-control" id="refPatient" required>
                    <option value="">Select patient...</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Referral Type <span class="required">*</span></label>
                  <select class="form-control" id="refType" required>
                    <option value="">Select type...</option>
                    <option value="attorney">Attorney</option>
                    <option value="doctor">Doctor</option>
                    <option value="specialist">Specialist</option>
                  </select>
                </div>
              </div>

              <div class="divider-h"></div>
              <div style="font-size:12px;font-weight:600;color:var(--gold);text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px;">
                Recipient Information
              </div>
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label">Recipient Name <span class="required">*</span></label>
                  <input type="text" class="form-control" id="refRecipientName" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Organization / Firm</label>
                  <input type="text" class="form-control" id="refOrganization" />
                </div>
                <div class="form-group">
                  <label class="form-label">Email</label>
                  <input type="email" class="form-control" id="refEmail" />
                </div>
                <div class="form-group">
                  <label class="form-label">Phone</label>
                  <input type="tel" class="form-control" id="refPhone" />
                </div>
              </div>

              <div class="divider-h"></div>
              <div class="form-grid">
                <div class="form-group full-width">
                  <label class="form-label">Reason / Summary <span class="required">*</span></label>
                  <textarea class="form-control" id="refReason" rows="3" required placeholder="Describe the reason for referral, relevant history, and urgency..."></textarea>
                </div>
                <div class="form-group full-width">
                  <label class="form-label">Additional Notes</label>
                  <textarea class="form-control" id="refNotes" rows="2"></textarea>
                </div>
              </div>

              <div class="divider-h"></div>
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label">Status</label>
                  <select class="form-control" id="refStatus">
                    ${REFERRAL_STATUSES.map(s => `<option value="${s}">${s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('')}
                  </select>
                </div>
                <div style="display:flex;align-items:flex-end;gap:8px;padding-bottom:2px;">
                  <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--text-secondary);">
                    <input type="checkbox" id="refAutoSend" style="width:16px;height:16px;accent-color:var(--gold);" />
                    Send referral immediately upon saving
                  </label>
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="referralModalCancel">Cancel</button>
            <button class="btn btn-primary" id="referralModalSave">
              <i class="fa-solid fa-floppy-disk"></i> Save Referral
            </button>
          </div>
        </div>
      </div>

      <!-- Send Referral Confirmation Modal -->
      <div class="modal-overlay" id="sendReferralModal">
        <div class="modal modal-md">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-paper-plane"></i> Send Referral</div>
            <button class="modal-close" id="sendReferralClose">&times;</button>
          </div>
          <div class="modal-body">
            <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:rgba(52,152,219,0.1);border:1px solid rgba(52,152,219,0.2);border-radius:var(--radius-sm);margin-bottom:16px;font-size:12.5px;color:var(--info);">
              <i class="fa-solid fa-envelope"></i>
              <span>The following referral will be marked as sent. In production, this would send an actual email.</span>
            </div>
            <div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px;">Email Preview</div>
            <div class="email-preview" id="emailPreview"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="sendReferralCancel">Cancel</button>
            <button class="btn btn-primary" id="sendReferralConfirm">
              <i class="fa-solid fa-paper-plane"></i> Confirm Send
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  async function render() {
    const view = document.getElementById('view-referrals');
    if (!view.querySelector('.section-title')) {
      view.innerHTML = buildReferralsHTML();
      bindReferralEvents();
    }
    allPatients = await window.api.patients.getAll();
    populatePatientSelect();
    await loadReferrals();
  }

  function populatePatientSelect() {
    const sel = document.getElementById('refPatient');
    if (!sel) return;
    const sorted = [...allPatients].sort((a,b) => a.last_name.localeCompare(b.last_name));
    sel.innerHTML = '<option value="">Select patient...</option>' +
      sorted.map(p => `<option value="${p.id}">${p.last_name}, ${p.first_name}</option>`).join('');
  }

  async function loadReferrals() {
    try {
      allReferrals = await window.api.referrals.getAll();
      renderReferralsTable();
    } catch (err) {
      console.error(err);
      toast('Failed to load referrals', 'error');
    }
  }

  function renderReferralsTable() {
    const search  = (document.getElementById('referralSearch')?.value || '').toLowerCase();
    const typeF   = document.getElementById('referralTypeFilter')?.value || '';
    const statusF = document.getElementById('referralStatusFilter')?.value || '';

    let filtered = allReferrals.filter(r => {
      const name = `${r.first_name} ${r.last_name}`.toLowerCase();
      const recipient = (r.recipient_name || '').toLowerCase();
      const matchSearch = !search || name.includes(search) || recipient.includes(search);
      const matchType   = !typeF   || r.type === typeF;
      const matchStatus = !statusF || r.status === statusF;
      return matchSearch && matchType && matchStatus;
    });

    const tbody = document.getElementById('referralsTableBody');
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="table-empty"><i class="fa-solid fa-share-nodes"></i><p>No referrals found</p></div></td></tr>`;
    } else {
      const typeIcons = { attorney: 'fa-scale-balanced', doctor: 'fa-user-doctor', specialist: 'fa-stethoscope' };
      tbody.innerHTML = filtered.map(r => `
        <tr class="clickable" onclick="window.Referrals.showReferralDetail(${r.id})">
          <td class="td-primary">${r.first_name} ${r.last_name}</td>
          <td>
            <span style="display:flex;align-items:center;gap:5px;font-size:12px;text-transform:capitalize;">
              <i class="fa-solid ${typeIcons[r.type] || 'fa-share-nodes'}" style="color:var(--gold);"></i>
              ${r.type}
            </span>
          </td>
          <td>${r.recipient_name || '—'}</td>
          <td style="font-size:12px;">
            ${r.recipient_email ? `<div><i class="fa-solid fa-envelope" style="color:var(--text-faint);margin-right:4px;"></i>${r.recipient_email}</div>` : ''}
            ${r.recipient_phone ? `<div><i class="fa-solid fa-phone" style="color:var(--text-faint);margin-right:4px;"></i>${r.recipient_phone}</div>` : ''}
            ${!r.recipient_email && !r.recipient_phone ? '—' : ''}
          </td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--text-muted);">${r.reason || '—'}</td>
          <td>${statusBadge(r.status)}</td>
          <td>${r.sent_date ? formatDate(r.sent_date) : '<span class="text-faint">—</span>'}</td>
          <td>${formatDate(r.created_at)}</td>
          <td onclick="event.stopPropagation()">
            <div class="action-row" style="gap:4px;">
              ${r.status === 'pending' ? `
                <button class="btn btn-sm btn-info" onclick="window.Referrals.promptSendReferral(${r.id})">
                  <i class="fa-solid fa-paper-plane"></i> Send
                </button>
              ` : ''}
              <button class="btn btn-icon btn-sm btn-outline" title="Edit" onclick="window.Referrals.openEditReferral(${r.id})">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="btn btn-icon btn-sm btn-danger" title="Delete" onclick="window.Referrals.deleteReferral(${r.id})">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `).join('');
    }

    const pending = filtered.filter(r => r.status === 'pending').length;
    document.getElementById('referralCount').textContent =
      `${filtered.length} referrals${pending > 0 ? ` · ${pending} pending` : ''}`;
  }

  // ── Referral Detail ────────────────────────────────────────────────────────
  async function showReferralDetail(id) {
    const ref = allReferrals.find(r => r.id === id);
    if (!ref) return;

    const panel = document.getElementById('referralDetailPanel');
    const content = document.getElementById('referralDetailContent');

    const typeIcons = { attorney: 'fa-scale-balanced', doctor: 'fa-user-doctor', specialist: 'fa-stethoscope' };

    // Load patient claims for context
    let claimsHTML = '';
    try {
      const claims = await window.api.claims.getByPatient(ref.patient_id);
      if (claims.length > 0) {
        claimsHTML = `
          <div class="divider-h"></div>
          <div style="font-size:12px;font-weight:600;color:var(--gold);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;">
            <i class="fa-solid fa-file-invoice-dollar"></i> Patient Claims
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${claims.map(c => `
              <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg-mid);border-radius:var(--radius-sm);">
                <span style="font-size:12px;color:var(--text-primary);font-weight:600;">${c.claim_number || 'CLM-'+c.id}</span>
                <span style="font-size:12px;color:var(--text-muted);">${c.insurer}</span>
                <span style="margin-left:auto;">${formatCurrency(c.amount)}</span>
                ${statusBadge(c.status)}
              </div>
            `).join('')}
          </div>
        `;
      }
    } catch(e) {}

    content.innerHTML = `
      <div class="card-header">
        <div class="card-title">
          <i class="fa-solid ${typeIcons[ref.type] || 'fa-share-nodes'}"></i>
          ${ref.type.charAt(0).toUpperCase()+ref.type.slice(1)} Referral — ${ref.first_name} ${ref.last_name}
        </div>
        <div class="action-row" style="gap:6px;">
          ${ref.status === 'pending' ? `
            <button class="btn btn-sm btn-info" onclick="window.Referrals.promptSendReferral(${ref.id})">
              <i class="fa-solid fa-paper-plane"></i> Send Referral
            </button>
          ` : ''}
          ${ref.status === 'sent' ? `
            <button class="btn btn-sm btn-success" onclick="window.Referrals.updateStatus(${ref.id},'acknowledged')">
              <i class="fa-solid fa-check"></i> Mark Acknowledged
            </button>
          ` : ''}
          ${ref.status === 'acknowledged' ? `
            <button class="btn btn-sm btn-success" onclick="window.Referrals.updateStatus(${ref.id},'completed')">
              <i class="fa-solid fa-flag-checkered"></i> Mark Completed
            </button>
          ` : ''}
          <button class="btn btn-sm btn-outline" onclick="window.Referrals.openEditReferral(${ref.id})">
            <i class="fa-solid fa-pen"></i> Edit
          </button>
        </div>
      </div>
      <div class="card-body">
        <div class="info-grid mb-16">
          <div class="info-item"><div class="info-label">Patient</div><div class="info-value">${ref.first_name} ${ref.last_name}</div></div>
          <div class="info-item"><div class="info-label">Phone</div><div class="info-value">${ref.phone || '—'}</div></div>
          <div class="info-item"><div class="info-label">Email</div><div class="info-value">${ref.email || '—'}</div></div>
          <div class="info-item"><div class="info-label">Referral Type</div><div class="info-value" style="text-transform:capitalize;">${ref.type}</div></div>
          <div class="info-item"><div class="info-label">Status</div><div class="info-value">${statusBadge(ref.status)}</div></div>
          <div class="info-item"><div class="info-label">Sent Date</div><div class="info-value">${ref.sent_date ? formatDate(ref.sent_date) : '—'}</div></div>
        </div>
        <div class="divider-h"></div>
        <div style="font-size:12px;font-weight:600;color:var(--gold);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;">
          <i class="fa-solid fa-address-card"></i> Recipient
        </div>
        <div class="info-grid mb-16">
          <div class="info-item"><div class="info-label">Name</div><div class="info-value">${ref.recipient_name || '—'}</div></div>
          <div class="info-item"><div class="info-label">Email</div><div class="info-value">${ref.recipient_email || '—'}</div></div>
          <div class="info-item"><div class="info-label">Phone</div><div class="info-value">${ref.recipient_phone || '—'}</div></div>
        </div>
        <div class="divider-h"></div>
        <div style="font-size:12px;font-weight:600;color:var(--gold);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;">
          <i class="fa-solid fa-notes-medical"></i> Reason
        </div>
        <div style="background:var(--bg-mid);padding:14px;border-radius:var(--radius-sm);font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:16px;">
          ${ref.reason || 'No reason provided.'}
        </div>
        ${ref.notes ? `
          <div style="font-size:12px;font-weight:600;color:var(--text-faint);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;">Notes</div>
          <div style="font-size:12.5px;color:var(--text-muted);">${ref.notes}</div>
        ` : ''}
        ${claimsHTML}
      </div>
    `;

    panel.classList.remove('hidden');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ── Send Referral ──────────────────────────────────────────────────────────
  async function promptSendReferral(id) {
    const ref = allReferrals.find(r => r.id === id);
    if (!ref) return;

    const patient = allPatients.find(p => p.id === ref.patient_id);
    const clinicName = 'Walden Bailey Chiropractic';
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const emailBody = `Date: ${today}

To: ${ref.recipient_name || 'Recipient'}
From: ${clinicName}, Buffalo, NY
Re: Patient Referral — ${ref.first_name} ${ref.last_name}

Dear ${ref.recipient_name || 'Colleague'},

I am writing to refer the above-named patient for ${ref.type === 'attorney' ? 'legal representation' : ref.type === 'specialist' ? 'specialist consultation' : 'evaluation and continued care'}.

PATIENT INFORMATION
Name: ${ref.first_name} ${ref.last_name}
Date of Birth: ${patient ? (patient.dob || 'On file') : 'On file'}
Phone: ${ref.phone || patient?.phone || 'On file'}

REASON FOR REFERRAL
${ref.reason || 'See enclosed clinical notes.'}

${ref.notes ? `ADDITIONAL NOTES\n${ref.notes}\n` : ''}
Please do not hesitate to contact our office with any questions or to obtain further clinical documentation.

Sincerely,

Dr. Walden Bailey, DC
Walden Bailey Chiropractic
Buffalo, NY
Tel: (716) 555-0100`;

    document.getElementById('emailPreview').textContent = emailBody;

    // Store referral id for confirm action
    document.getElementById('sendReferralConfirm').dataset.refId = id;
    openModal('sendReferralModal');
  }

  async function confirmSendReferral(id) {
    try {
      await window.api.referrals.sendReferral(id);
      toast('Referral sent successfully', 'success');
      closeModal('sendReferralModal');
      await loadReferrals();

      // Update badge
      const pending = allReferrals.filter(r => r.status === 'pending').length;
      const badge = document.getElementById('pending-referrals-badge');
      if (badge) {
        if (pending > 0) { badge.textContent = pending; badge.style.display = 'inline-flex'; }
        else badge.style.display = 'none';
      }
    } catch (err) {
      toast('Failed to send referral', 'error');
    }
  }

  async function updateStatus(id, newStatus) {
    try {
      const ref = allReferrals.find(r => r.id === id);
      if (!ref) return;
      const updatedData = { ...ref, status: newStatus };
      delete updatedData.first_name;
      delete updatedData.last_name;
      delete updatedData.phone;
      delete updatedData.email;
      await window.api.referrals.update(id, updatedData);
      toast(`Referral marked as ${newStatus}`, 'success');
      await loadReferrals();
      // Refresh detail if visible
      const panel = document.getElementById('referralDetailPanel');
      if (!panel.classList.contains('hidden')) showReferralDetail(id);
    } catch (err) {
      toast('Failed to update referral', 'error');
    }
  }

  // ── Add / Edit Referral ────────────────────────────────────────────────────
  function openNewReferral() {
    editingReferralId = null;
    document.getElementById('referralModalTitle').textContent = 'New Referral';
    document.getElementById('referralForm').reset();
    openModal('referralModal');
  }

  async function openEditReferral(id) {
    const ref = allReferrals.find(r => r.id === id);
    if (!ref) return;
    editingReferralId = id;
    document.getElementById('referralModalTitle').textContent = 'Edit Referral';
    document.getElementById('refPatient').value = ref.patient_id;
    document.getElementById('refType').value = ref.type || '';
    document.getElementById('refRecipientName').value = ref.recipient_name || '';
    document.getElementById('refEmail').value = ref.recipient_email || '';
    document.getElementById('refPhone').value = ref.recipient_phone || '';
    document.getElementById('refReason').value = ref.reason || '';
    document.getElementById('refNotes').value = ref.notes || '';
    document.getElementById('refStatus').value = ref.status || 'pending';
    openModal('referralModal');
  }

  async function saveReferral() {
    const patientId     = document.getElementById('refPatient').value;
    const type          = document.getElementById('refType').value;
    const recipientName = document.getElementById('refRecipientName').value.trim();
    const reason        = document.getElementById('refReason').value.trim();

    if (!patientId)     { toast('Please select a patient', 'warning'); return; }
    if (!type)          { toast('Please select a referral type', 'warning'); return; }
    if (!recipientName) { toast('Please enter recipient name', 'warning'); return; }
    if (!reason)        { toast('Please enter reason for referral', 'warning'); return; }

    const autoSend = document.getElementById('refAutoSend').checked;
    const status   = autoSend ? 'sent' : (document.getElementById('refStatus').value || 'pending');

    const data = {
      patient_id:      parseInt(patientId),
      type,
      recipient_name:  recipientName,
      recipient_email: document.getElementById('refEmail').value.trim() || null,
      recipient_phone: document.getElementById('refPhone').value.trim() || null,
      reason,
      notes:           document.getElementById('refNotes').value.trim() || null,
      status,
      sent_date:       autoSend ? window.App.todayString() : null
    };

    const btn = document.getElementById('referralModalSave');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
      if (editingReferralId) {
        await window.api.referrals.update(editingReferralId, data);
        toast('Referral updated', 'success');
      } else {
        await window.api.referrals.create(data);
        toast(autoSend ? 'Referral created and marked as sent' : 'Referral created', 'success');
      }
      closeModal('referralModal');
      await loadReferrals();
    } catch (err) {
      console.error(err);
      toast('Failed to save referral', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Referral';
    }
  }

  async function deleteReferral(id) {
    const confirmed = await confirm('Delete this referral?', 'Delete', 'btn-danger');
    if (!confirmed) return;
    try {
      await window.api.referrals.delete(id);
      toast('Referral deleted', 'success');
      await loadReferrals();
      // Hide detail panel if showing deleted referral
      document.getElementById('referralDetailPanel').classList.add('hidden');
    } catch (err) {
      toast('Failed to delete referral', 'error');
    }
  }

  // ── Bind Events ───────────────────────────────────────────────────────────
  function bindReferralEvents() {
    document.getElementById('newReferralBtn')?.addEventListener('click', openNewReferral);

    document.getElementById('referralSearch')?.addEventListener('input', () => {
      clearTimeout(window._refSearchTimer);
      window._refSearchTimer = setTimeout(renderReferralsTable, 200);
    });
    document.getElementById('referralTypeFilter')?.addEventListener('change', renderReferralsTable);
    document.getElementById('referralStatusFilter')?.addEventListener('change', renderReferralsTable);

    document.getElementById('referralModalSave')?.addEventListener('click', saveReferral);

    document.getElementById('sendReferralConfirm')?.addEventListener('click', (e) => {
      const refId = parseInt(e.target.dataset.refId);
      if (refId) confirmSendReferral(refId);
    });

    document.getElementById('closeReferralDetail')?.addEventListener('click', () => {
      document.getElementById('referralDetailPanel').classList.add('hidden');
    });

    window.App.setupModalClose('referralModal',    ['referralModalClose', 'referralModalCancel']);
    window.App.setupModalClose('sendReferralModal',['sendReferralClose', 'sendReferralCancel']);
  }

  return {
    render,
    openEditReferral,
    deleteReferral,
    promptSendReferral,
    showReferralDetail,
    updateStatus,
    refresh: loadReferrals
  };
})();
