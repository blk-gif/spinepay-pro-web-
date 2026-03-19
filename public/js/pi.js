'use strict';

// ── Personal Injury Cases Module ──────────────────────────────────────────────
window.PICases = (() => {
  const { toast, confirm, openModal, closeModal, formatDate, formatCurrency, getCurrentUser } = window.App;

  let allCases    = [];
  let allPatients = [];
  let editingCaseId   = null;
  let activeFilter    = 'all';

  const CASE_STATUSES = ['open', 'in-negotiation', 'litigation', 'settled', 'closed'];

  const STATUS_LABELS = {
    'open':           'Open',
    'in-negotiation': 'In Negotiation',
    'litigation':     'Litigation',
    'settled':        'Settled',
    'closed':         'Closed'
  };

  function piStatusBadge(status) {
    const cls = {
      'open':           'pi-status-open',
      'in-negotiation': 'pi-status-negotiation',
      'litigation':     'pi-status-litigation',
      'settled':        'pi-status-settled',
      'closed':         'pi-status-closed'
    }[status] || 'pi-status-open';
    return `<span class="badge ${cls}">${STATUS_LABELS[status] || status}</span>`;
  }

  // ── Build HTML ─────────────────────────────────────────────────────────────
  function buildHTML() {
    const isAdmin = getCurrentUser()?.role === 'admin';

    return `
      <div class="section-header mb-16">
        <div class="section-title">Personal Injury <span>Cases</span></div>
        <button class="btn btn-primary" id="newPIBtn">
          <i class="fa-solid fa-plus"></i> New PI Case
        </button>
      </div>

      <!-- Summary stat cards -->
      <div class="stats-row mb-16">
        <div class="stat-card">
          <div class="stat-icon" style="color:var(--gold);"><i class="fa-solid fa-folder-open"></i></div>
          <div class="stat-value" id="pi-stat-open">0</div>
          <div class="stat-label">Open Cases</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="color:var(--danger);"><i class="fa-solid fa-gavel"></i></div>
          <div class="stat-value" id="pi-stat-litigation">0</div>
          <div class="stat-label">In Litigation</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="color:var(--success);"><i class="fa-solid fa-handshake"></i></div>
          <div class="stat-value" id="pi-stat-settled">0</div>
          <div class="stat-label">Settled</div>
        </div>
        ${isAdmin ? `
        <div class="stat-card">
          <div class="stat-icon" style="color:var(--gold);"><i class="fa-solid fa-scale-balanced"></i></div>
          <div class="stat-value" id="pi-stat-lien">—</div>
          <div class="stat-label">Total Lien Amount</div>
        </div>
        ` : ''}
      </div>

      <div class="card card-gold">
        <!-- Filter bar -->
        <div class="filter-bar">
          <div class="filter-chips" id="piFilterChips">
            <button class="filter-chip active" data-status="all">All</button>
            ${CASE_STATUSES.map(s => `<button class="filter-chip" data-status="${s}">${STATUS_LABELS[s]}</button>`).join('')}
          </div>
        </div>

        <div class="table-wrapper">
          <table id="piTable">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Case #</th>
                <th>Accident Date</th>
                <th>Attorney</th>
                <th>Firm</th>
                ${isAdmin ? '<th>Lien Amount</th>' : ''}
                <th>Case Status</th>
                <th style="width:100px;">Actions</th>
              </tr>
            </thead>
            <tbody id="piTableBody">
              <tr><td colspan="${isAdmin ? 8 : 7}"><div class="table-empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading...</p></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Case Detail Panel -->
      <div class="modal-overlay" id="piDetailModal">
        <div class="modal modal-lg">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-scale-balanced"></i> PI Case Detail</div>
            <button class="modal-close" id="piDetailClose">&times;</button>
          </div>
          <div class="modal-body" id="piDetailBody"></div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="piDetailCancel">Close</button>
            <button class="btn btn-outline" id="piDetailEditBtn"><i class="fa-solid fa-pen"></i> Edit Case</button>
          </div>
        </div>
      </div>

      <!-- New / Edit PI Case Modal -->
      <div class="modal-overlay" id="piCaseModal">
        <div class="modal modal-lg">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-folder-plus"></i> <span id="piModalTitle">New PI Case</span></div>
            <button class="modal-close" id="piModalClose">&times;</button>
          </div>
          <div class="modal-body">
            <form id="piForm">
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label">Patient <span class="required">*</span></label>
                  <select class="form-control" id="piPatient" required>
                    <option value="">Select patient...</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Case Number</label>
                  <input type="text" class="form-control" id="piCaseNumber" placeholder="e.g. PI-2025-001" />
                </div>
                <div class="form-group">
                  <label class="form-label">Accident Date <span class="required">*</span></label>
                  <input type="date" class="form-control" id="piAccidentDate" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Case Status</label>
                  <select class="form-control" id="piCaseStatus">
                    ${CASE_STATUSES.map(s => `<option value="${s}">${STATUS_LABELS[s]}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group full-width">
                  <label class="form-label">Accident Description</label>
                  <textarea class="form-control" id="piAccidentDescription" rows="2" placeholder="Brief description of the accident..."></textarea>
                </div>

                <div class="form-group-section full-width">
                  <div class="form-section-label"><i class="fa-solid fa-briefcase"></i> Attorney Information</div>
                </div>
                <div class="form-group">
                  <label class="form-label">Attorney Name</label>
                  <input type="text" class="form-control" id="piAttorneyName" placeholder="Full name..." />
                </div>
                <div class="form-group">
                  <label class="form-label">Attorney Firm</label>
                  <input type="text" class="form-control" id="piAttorneyFirm" placeholder="Law firm name..." />
                </div>
                <div class="form-group">
                  <label class="form-label">Attorney Phone</label>
                  <input type="tel" class="form-control" id="piAttorneyPhone" placeholder="(716) 555-0100" />
                </div>
                <div class="form-group">
                  <label class="form-label">Attorney Email</label>
                  <input type="email" class="form-control" id="piAttorneyEmail" placeholder="attorney@lawfirm.com" />
                </div>

                <div class="form-group-section full-width">
                  <div class="form-section-label"><i class="fa-solid fa-dollar-sign"></i> Financial</div>
                </div>
                <div class="form-group">
                  <label class="form-label">Lien Amount ($)</label>
                  <input type="number" class="form-control" id="piLienAmount" min="0" step="0.01" placeholder="0.00" />
                </div>
                <div class="form-group" id="piSettlementGroup" style="display:none;">
                  <label class="form-label">Settlement Amount ($)</label>
                  <input type="number" class="form-control" id="piSettlementAmount" min="0" step="0.01" placeholder="0.00" />
                </div>

                <div class="form-group full-width">
                  <label class="form-label">Notes</label>
                  <textarea class="form-control" id="piNotes" rows="2" placeholder="Additional case notes..."></textarea>
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="piModalCancel">Cancel</button>
            <button class="btn btn-primary" id="piModalSave">
              <i class="fa-solid fa-floppy-disk"></i> Save Case
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  async function render() {
    const view = document.getElementById('view-pi');
    if (!view.querySelector('.section-header')) {
      view.innerHTML = buildHTML();
      bindEvents();
    }
    await loadAll();
  }

  async function loadAll() {
    try {
      [allCases, allPatients] = await Promise.all([
        window.api.pi.getAll(),
        window.api.patients.getAll()
      ]);
      populatePatientSelect();
      updateStats();
      renderTable();
    } catch (err) {
      console.error('PI loadAll error:', err);
      toast('Failed to load PI cases', 'error');
    }
  }

  function populatePatientSelect() {
    const sel = document.getElementById('piPatient');
    if (!sel) return;
    const sorted = [...allPatients].sort((a, b) => a.last_name.localeCompare(b.last_name));
    sel.innerHTML = '<option value="">Select patient...</option>' +
      sorted.map(p => `<option value="${p.id}">${p.last_name}, ${p.first_name}</option>`).join('');
  }

  function updateStats() {
    const isAdmin = getCurrentUser()?.role === 'admin';

    const open       = allCases.filter(c => c.case_status === 'open').length;
    const litigation = allCases.filter(c => c.case_status === 'litigation').length;
    const settled    = allCases.filter(c => c.case_status === 'settled').length;

    const statOpen = document.getElementById('pi-stat-open');
    const statLit  = document.getElementById('pi-stat-litigation');
    const statSet  = document.getElementById('pi-stat-settled');
    if (statOpen) statOpen.textContent = open;
    if (statLit)  statLit.textContent  = litigation;
    if (statSet)  statSet.textContent  = settled;

    if (isAdmin) {
      const totalLien = allCases.reduce((sum, c) => sum + (parseFloat(c.lien_amount) || 0), 0);
      const statLien  = document.getElementById('pi-stat-lien');
      if (statLien) statLien.textContent = formatCurrency(totalLien);
    }
  }

  function renderTable() {
    const isAdmin  = getCurrentUser()?.role === 'admin';
    const filtered = activeFilter === 'all'
      ? allCases
      : allCases.filter(c => c.case_status === activeFilter);

    const tbody = document.getElementById('piTableBody');
    if (!tbody) return;

    if (filtered.length === 0) {
      const colCount = isAdmin ? 8 : 7;
      tbody.innerHTML = `<tr><td colspan="${colCount}"><div class="table-empty"><i class="fa-solid fa-scale-balanced"></i><p>No PI cases found</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(c => `
      <tr class="clickable" onclick="window.PICases.openDetail(${c.id})">
        <td class="td-primary">${c.patient_name || '—'}</td>
        <td style="font-size:12px;font-family:monospace;">${c.case_number || '—'}</td>
        <td>${formatDate(c.accident_date)}</td>
        <td style="font-size:12px;">${c.attorney_name || '—'}</td>
        <td style="font-size:12px;">${c.attorney_firm || '—'}</td>
        ${isAdmin ? `<td style="font-weight:600;color:var(--gold);">${c.lien_amount ? formatCurrency(c.lien_amount) : '—'}</td>` : ''}
        <td>${piStatusBadge(c.case_status)}</td>
        <td onclick="event.stopPropagation()">
          <div class="action-row" style="gap:4px;">
            <button class="btn btn-icon btn-sm btn-outline" title="Edit" onclick="window.PICases.openEdit(${c.id})">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-icon btn-sm btn-danger" title="Delete" onclick="window.PICases.deleteCase(${c.id})">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  // ── Detail Panel ──────────────────────────────────────────────────────────
  async function openDetail(id) {
    const piCase = allCases.find(c => c.id === id);
    if (!piCase) return;

    const isAdmin = getCurrentUser()?.role === 'admin';

    // Load patient info and referrals
    let referralsHTML = '';
    try {
      const refs = await window.api.referrals.getByPatient(piCase.patient_id);
      if (refs && refs.length > 0) {
        referralsHTML = `
          <div style="margin-top:16px;">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;letter-spacing:.05em;">Linked Referrals</div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              ${refs.map(r => `
                <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg-mid);border-radius:var(--radius-sm);font-size:12px;">
                  <i class="fa-solid fa-arrow-right-to-bracket" style="color:var(--gold);"></i>
                  <span>${r.referral_type || 'Referral'}</span>
                  <span style="color:var(--text-muted);">—</span>
                  <span>${r.referred_to || '—'}</span>
                  <span style="margin-left:auto;">${window.App.statusBadge(r.status)}</span>
                </div>
              `).join('')}
            </div>
          </div>`;
      }
    } catch (e) {}

    // Find patient contact info
    const patient = allPatients.find(p => p.id === piCase.patient_id);

    document.getElementById('piDetailBody').innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;">
        <!-- Patient info -->
        ${patient ? `
        <div style="display:flex;align-items:center;gap:12px;padding:14px;background:var(--bg-mid);border-radius:var(--radius);border:1px solid var(--border);">
          <div class="user-avatar" style="width:44px;height:44px;font-size:15px;">${patient.first_name[0]}${patient.last_name[0]}</div>
          <div>
            <div style="font-size:15px;font-weight:700;color:var(--text-primary);">${patient.first_name} ${patient.last_name}</div>
            <div style="font-size:12px;color:var(--text-muted);">${patient.phone || 'No phone'} &bull; ${patient.email || 'No email'}</div>
            <div style="font-size:11px;color:var(--text-muted);">DOB: ${formatDate(patient.dob)}</div>
          </div>
          <div style="margin-left:auto;">${piStatusBadge(piCase.case_status)}</div>
        </div>
        ` : ''}

        <!-- Case info grid -->
        <div class="info-grid" style="grid-template-columns:repeat(3,1fr);">
          <div class="info-item"><div class="info-label">Case Number</div><div class="info-value" style="font-family:monospace;">${piCase.case_number || '—'}</div></div>
          <div class="info-item"><div class="info-label">Accident Date</div><div class="info-value">${formatDate(piCase.accident_date)}</div></div>
          <div class="info-item"><div class="info-label">Case Status</div><div class="info-value">${piStatusBadge(piCase.case_status)}</div></div>
          ${isAdmin ? `
          <div class="info-item"><div class="info-label">Lien Amount</div><div class="info-value" style="color:var(--gold);font-weight:700;">${piCase.lien_amount ? formatCurrency(piCase.lien_amount) : '—'}</div></div>
          ${piCase.settlement_amount ? `<div class="info-item"><div class="info-label">Settlement Amount</div><div class="info-value" style="color:var(--success);font-weight:700;">${formatCurrency(piCase.settlement_amount)}</div></div>` : ''}
          ` : ''}
        </div>

        ${piCase.accident_description ? `
        <div style="padding:12px;background:var(--bg-mid);border-radius:var(--radius-sm);border-left:3px solid var(--gold);">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;">Accident Description</div>
          <div style="font-size:13px;color:var(--text-primary);">${piCase.accident_description}</div>
        </div>
        ` : ''}

        <!-- Attorney info -->
        ${(piCase.attorney_name || piCase.attorney_firm) ? `
        <div style="padding:14px;background:var(--bg-mid);border-radius:var(--radius);border:1px solid var(--border);">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;letter-spacing:.05em;"><i class="fa-solid fa-briefcase" style="color:var(--gold);margin-right:5px;"></i>Attorney</div>
          <div class="info-grid" style="grid-template-columns:repeat(2,1fr);">
            ${piCase.attorney_name ? `<div class="info-item"><div class="info-label">Name</div><div class="info-value">${piCase.attorney_name}</div></div>` : ''}
            ${piCase.attorney_firm ? `<div class="info-item"><div class="info-label">Firm</div><div class="info-value">${piCase.attorney_firm}</div></div>` : ''}
            ${piCase.attorney_phone ? `<div class="info-item"><div class="info-label">Phone</div><div class="info-value">${piCase.attorney_phone}</div></div>` : ''}
            ${piCase.attorney_email ? `<div class="info-item"><div class="info-label">Email</div><div class="info-value">${piCase.attorney_email}</div></div>` : ''}
          </div>
        </div>
        ` : ''}

        ${piCase.notes ? `
        <div style="padding:12px;background:var(--bg-mid);border-radius:var(--radius-sm);">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;">Notes</div>
          <div style="font-size:13px;color:var(--text-muted);">${piCase.notes}</div>
        </div>
        ` : ''}

        ${referralsHTML}
      </div>
    `;

    // Wire edit button in detail modal
    const editBtn = document.getElementById('piDetailEditBtn');
    if (editBtn) {
      editBtn.onclick = () => { closeModal('piDetailModal'); openEdit(id); };
    }

    openModal('piDetailModal');
  }

  // ── New / Edit ─────────────────────────────────────────────────────────────
  function openNew() {
    editingCaseId = null;
    const titleEl = document.getElementById('piModalTitle');
    if (titleEl) titleEl.textContent = 'New PI Case';
    document.getElementById('piForm')?.reset();
    toggleSettlementField('open');
    openModal('piCaseModal');
  }

  function openEdit(id) {
    const c = allCases.find(x => x.id === id);
    if (!c) return;
    editingCaseId = id;
    const titleEl = document.getElementById('piModalTitle');
    if (titleEl) titleEl.textContent = 'Edit PI Case';

    document.getElementById('piPatient').value             = c.patient_id || '';
    document.getElementById('piCaseNumber').value          = c.case_number || '';
    document.getElementById('piAccidentDate').value        = c.accident_date || '';
    document.getElementById('piCaseStatus').value          = c.case_status || 'open';
    document.getElementById('piAccidentDescription').value = c.accident_description || '';
    document.getElementById('piAttorneyName').value        = c.attorney_name || '';
    document.getElementById('piAttorneyFirm').value        = c.attorney_firm || '';
    document.getElementById('piAttorneyPhone').value       = c.attorney_phone || '';
    document.getElementById('piAttorneyEmail').value       = c.attorney_email || '';
    document.getElementById('piLienAmount').value          = c.lien_amount || '';
    document.getElementById('piSettlementAmount').value    = c.settlement_amount || '';
    document.getElementById('piNotes').value               = c.notes || '';
    toggleSettlementField(c.case_status);
    openModal('piCaseModal');
  }

  function toggleSettlementField(status) {
    const group = document.getElementById('piSettlementGroup');
    if (group) group.style.display = status === 'settled' ? '' : 'none';
  }

  async function saveCase() {
    const patientId    = document.getElementById('piPatient').value;
    const accidentDate = document.getElementById('piAccidentDate').value;

    if (!patientId)    { toast('Please select a patient', 'warning'); return; }
    if (!accidentDate) { toast('Please enter an accident date', 'warning'); return; }

    const data = {
      patient_id:            parseInt(patientId),
      case_number:           document.getElementById('piCaseNumber').value.trim() || null,
      accident_date:         accidentDate,
      case_status:           document.getElementById('piCaseStatus').value,
      accident_description:  document.getElementById('piAccidentDescription').value.trim() || null,
      attorney_name:         document.getElementById('piAttorneyName').value.trim() || null,
      attorney_firm:         document.getElementById('piAttorneyFirm').value.trim() || null,
      attorney_phone:        document.getElementById('piAttorneyPhone').value.trim() || null,
      attorney_email:        document.getElementById('piAttorneyEmail').value.trim() || null,
      lien_amount:           parseFloat(document.getElementById('piLienAmount').value) || null,
      settlement_amount:     parseFloat(document.getElementById('piSettlementAmount').value) || null,
      notes:                 document.getElementById('piNotes').value.trim() || null
    };

    const btn = document.getElementById('piModalSave');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
      if (editingCaseId) {
        await window.api.pi.update(editingCaseId, data);
        toast('PI case updated', 'success');
      } else {
        await window.api.pi.create(data);
        toast('PI case created', 'success');
      }
      closeModal('piCaseModal');
      await loadAll();
    } catch (err) {
      console.error(err);
      toast('Failed to save PI case', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Case';
    }
  }

  async function deleteCase(id) {
    const confirmed = await confirm('Delete this PI case? This cannot be undone.', 'Delete', 'btn-danger');
    if (!confirmed) return;
    try {
      await window.api.pi.delete(id);
      toast('PI case deleted', 'success');
      await loadAll();
    } catch (err) {
      toast('Failed to delete PI case', 'error');
    }
  }

  // ── Bind Events ───────────────────────────────────────────────────────────
  function bindEvents() {
    document.getElementById('newPIBtn')?.addEventListener('click', openNew);
    document.getElementById('piModalSave')?.addEventListener('click', saveCase);

    // Status change toggles settlement field
    document.getElementById('piCaseStatus')?.addEventListener('change', (e) => {
      toggleSettlementField(e.target.value);
    });

    // Filter chips
    document.getElementById('piFilterChips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;
      document.querySelectorAll('#piFilterChips .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.status;
      renderTable();
    });

    window.App.setupModalClose('piCaseModal',   ['piModalClose', 'piModalCancel']);
    window.App.setupModalClose('piDetailModal', ['piDetailClose', 'piDetailCancel']);
  }

  return {
    render,
    openDetail,
    openEdit,
    deleteCase,
    refresh: loadAll
  };
})();
