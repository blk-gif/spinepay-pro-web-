'use strict';

// ── Personal Injury Cases Module ──────────────────────────────────────────────
window.PICases = (() => {
  const { toast, confirm, openModal, closeModal, formatDate, formatCurrency, getCurrentUser } = window.App;

  let allCases    = [];
  let allPatients = [];
  let editingCaseId   = null;
  let activeFilter    = 'all';

  // Invoice state
  let invoiceCaseId    = null;
  let invoiceNotesList = [];

  const CASE_STATUSES = ['open', 'in-negotiation', 'litigation', 'settled', 'closed'];

  const STATUS_LABELS = {
    'open':           'Open',
    'in-negotiation': 'In Negotiation',
    'litigation':     'Litigation',
    'settled':        'Settled',
    'closed':         'Closed'
  };

  // Common chiropractic CPT code descriptions
  const CPT_LABELS = {
    '98940': 'Chiropractic Manipulative Treatment (1-2 regions)',
    '98941': 'Chiropractic Manipulative Treatment (3-4 regions)',
    '98942': 'Chiropractic Manipulative Treatment (5 regions)',
    '97012': 'Mechanical Traction',
    '97014': 'Electrical Stimulation',
    '97018': 'Paraffin Bath',
    '97026': 'Infrared Therapy',
    '97032': 'Electrical Stimulation, Manual',
    '97035': 'Ultrasound Therapy',
    '97110': 'Therapeutic Exercise',
    '97112': 'Neuromuscular Reeducation',
    '97140': 'Manual Therapy Techniques',
    '97150': 'Therapeutic Procedure, Group',
    '97530': 'Therapeutic Activities',
    '97535': 'Self-Care/Home Management Training',
    '99202': 'New Patient Office Visit (Level 2)',
    '99203': 'New Patient Office Visit (Level 3)',
    '99213': 'Established Patient Office Visit (Level 3)',
    '99214': 'Established Patient Office Visit (Level 4)',
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

  function getCptDescription(cptCodes) {
    if (!cptCodes || !cptCodes.trim()) return 'Chiropractic Treatment';
    const codes = cptCodes.split(/[,;]+/).map(c => c.trim()).filter(Boolean);
    return codes.map(c => CPT_LABELS[c] || `CPT ${c}`).join('; ');
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
                <th>Insurance / Claim</th>
                <th>Attorney</th>
                ${isAdmin ? '<th>Lien Amount</th>' : ''}
                <th>Case Status</th>
                <th style="width:130px;">Actions</th>
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
                  <div class="form-section-label"><i class="fa-solid fa-shield-halved"></i> Insurance Information</div>
                </div>
                <div class="form-group">
                  <label class="form-label">Insurance Company</label>
                  <input type="text" class="form-control" id="piInsuranceCompany" placeholder="e.g. Geico, State Farm, Allstate..." />
                </div>
                <div class="form-group">
                  <label class="form-label">Claim Number</label>
                  <input type="text" class="form-control" id="piClaimNumber" placeholder="Insurance claim #..." />
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

      <!-- Invoice Generator Modal -->
      <div class="modal-overlay" id="piInvoiceModal">
        <div class="modal modal-lg" style="max-width:860px;">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-file-invoice-dollar"></i> Generate PI Invoice</div>
            <button class="modal-close" id="piInvoiceClose">&times;</button>
          </div>
          <div class="modal-body">

            <!-- Case / patient summary (read-only) -->
            <div id="piInvoiceSummary"></div>

            <!-- Date range -->
            <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:flex-end;margin-top:16px;">
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label">From Date</label>
                <input type="date" class="form-control" id="invoiceStartDate" />
              </div>
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label">To Date</label>
                <input type="date" class="form-control" id="invoiceEndDate" />
              </div>
              <button class="btn btn-outline" id="invoiceLoadVisits">
                <i class="fa-solid fa-rotate"></i> Load Visits
              </button>
            </div>

            <!-- Line items table (populated after Load Visits) -->
            <div id="invoiceLineItemsWrap" style="margin-top:16px;"></div>

            <!-- Adjustment + notes (shown after visits load) -->
            <div id="invoiceAdjustRow" style="display:none;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label">Adjustment / Write-off ($)</label>
                <input type="number" class="form-control" id="invoiceAdjustment" min="0" step="0.01" value="0" />
              </div>
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label">Invoice Notes (optional)</label>
                <input type="text" class="form-control" id="invoiceNotes" placeholder="e.g. Per lien agreement..." />
              </div>
            </div>

            <!-- Running totals -->
            <div id="invoiceTotals" style="display:none;margin-top:12px;"></div>

          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="piInvoiceCancel">Cancel</button>
            <button class="btn btn-primary" id="piInvoiceDownload" disabled>
              <i class="fa-solid fa-file-pdf"></i> Download Invoice PDF
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
        <td class="td-primary">${c.patient_name || (c.first_name ? `${c.first_name} ${c.last_name}` : '—')}</td>
        <td style="font-size:12px;font-family:monospace;">${c.case_number || '—'}</td>
        <td>${formatDate(c.date_of_accident)}</td>
        <td style="font-size:12px;">
          ${c.insurance_company ? `<div>${c.insurance_company}</div>` : '—'}
          ${c.claim_number ? `<div style="color:var(--text-muted);font-size:11px;">${c.claim_number}</div>` : ''}
        </td>
        <td style="font-size:12px;">${c.attorney_name || '—'}</td>
        ${isAdmin ? `<td style="font-weight:600;color:var(--gold);">${c.lien_amount ? formatCurrency(c.lien_amount) : '—'}</td>` : ''}
        <td>${piStatusBadge(c.case_status)}</td>
        <td onclick="event.stopPropagation()">
          <div class="action-row" style="gap:4px;">
            <button class="btn btn-icon btn-sm btn-outline" title="Generate Invoice"
              style="color:var(--gold);border-color:var(--gold);"
              onclick="window.PICases.openInvoice(${c.id})">
              <i class="fa-solid fa-file-invoice-dollar"></i>
            </button>
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

    const patient = allPatients.find(p => p.id === piCase.patient_id);

    document.getElementById('piDetailBody').innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;">
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

        <div class="info-grid" style="grid-template-columns:repeat(3,1fr);">
          <div class="info-item"><div class="info-label">Case Number</div><div class="info-value" style="font-family:monospace;">${piCase.case_number || '—'}</div></div>
          <div class="info-item"><div class="info-label">Accident Date</div><div class="info-value">${formatDate(piCase.date_of_accident)}</div></div>
          <div class="info-item"><div class="info-label">Case Status</div><div class="info-value">${piStatusBadge(piCase.case_status)}</div></div>
          <div class="info-item"><div class="info-label">Insurance Company</div><div class="info-value">${piCase.insurance_company || '—'}</div></div>
          <div class="info-item"><div class="info-label">Claim Number</div><div class="info-value" style="font-family:monospace;">${piCase.claim_number || '—'}</div></div>
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
    document.getElementById('piAccidentDate').value        = c.date_of_accident ? String(c.date_of_accident).split('T')[0] : '';
    document.getElementById('piCaseStatus').value          = c.case_status || 'open';
    document.getElementById('piAccidentDescription').value = c.accident_description || '';
    document.getElementById('piInsuranceCompany').value    = c.insurance_company || '';
    document.getElementById('piClaimNumber').value         = c.claim_number || '';
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
      date_of_accident:      accidentDate,
      case_status:           document.getElementById('piCaseStatus').value,
      accident_description:  document.getElementById('piAccidentDescription').value.trim() || null,
      insurance_company:     document.getElementById('piInsuranceCompany').value.trim() || null,
      claim_number:          document.getElementById('piClaimNumber').value.trim() || null,
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

  // ── Invoice Generator ──────────────────────────────────────────────────────

  function openInvoice(id) {
    const piCase = allCases.find(c => c.id === id);
    if (!piCase) return;

    invoiceCaseId    = id;
    invoiceNotesList = [];

    // Build read-only summary
    const patient = allPatients.find(p => p.id === piCase.patient_id);
    const patName = patient
      ? `${patient.first_name} ${patient.last_name}`
      : (piCase.patient_name || '—');
    const dob = patient?.dob ? formatDate(patient.dob) : '—';

    document.getElementById('piInvoiceSummary').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:14px;
                  background:var(--bg-mid);border-radius:var(--radius);border:1px solid var(--border);">
        <div><div class="info-label">Patient</div>
             <div class="info-value" style="font-weight:700;">${patName}</div></div>
        <div><div class="info-label">DOB</div>
             <div class="info-value">${dob}</div></div>
        <div><div class="info-label">Accident Date</div>
             <div class="info-value">${formatDate(piCase.date_of_accident)}</div></div>
        <div><div class="info-label">Insurance Company</div>
             <div class="info-value">${piCase.insurance_company || '<span style="color:var(--text-muted)">Not set</span>'}</div></div>
        <div><div class="info-label">Claim Number</div>
             <div class="info-value" style="font-family:monospace;">${piCase.claim_number || '<span style="color:var(--text-muted)">Not set</span>'}</div></div>
        <div><div class="info-label">Attorney</div>
             <div class="info-value">${piCase.attorney_name || '—'}${piCase.attorney_firm ? ` <span style="color:var(--text-muted);font-size:11px;">(${piCase.attorney_firm})</span>` : ''}</div></div>
      </div>`;

    // Default date range: accident date → today
    const today = new Date().toISOString().split('T')[0];
    const accDate = piCase.date_of_accident
      ? String(piCase.date_of_accident).split('T')[0]
      : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    document.getElementById('invoiceStartDate').value = accDate;
    document.getElementById('invoiceEndDate').value   = today;

    // Reset state
    document.getElementById('invoiceLineItemsWrap').innerHTML = '';
    document.getElementById('invoiceTotals').style.display    = 'none';
    document.getElementById('invoiceAdjustRow').style.display = 'none';
    document.getElementById('piInvoiceDownload').disabled      = true;
    document.getElementById('invoiceAdjustment').value         = '0';
    document.getElementById('invoiceNotes').value              = '';

    openModal('piInvoiceModal');
  }

  async function loadInvoiceVisits() {
    const startDate = document.getElementById('invoiceStartDate').value;
    const endDate   = document.getElementById('invoiceEndDate').value;

    if (!startDate || !endDate) {
      toast('Please select a date range', 'warning');
      return;
    }
    if (startDate > endDate) {
      toast('Start date must be before end date', 'warning');
      return;
    }

    const piCase = allCases.find(c => c.id === invoiceCaseId);
    if (!piCase) return;

    const btn = document.getElementById('invoiceLoadVisits');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';

    try {
      const notes = await window.api.soap.getByPatient(piCase.patient_id);

      // Filter by date range
      const filtered = notes.filter(n => {
        const d = n.note_date
          ? String(n.note_date).split('T')[0]
          : (n.created_at ? String(n.created_at).split('T')[0] : null);
        return d && d >= startDate && d <= endDate;
      });

      invoiceNotesList = filtered;

      if (filtered.length === 0) {
        document.getElementById('invoiceLineItemsWrap').innerHTML = `
          <div style="text-align:center;padding:24px;color:var(--text-muted);border:1px dashed var(--border);border-radius:var(--radius);margin-top:8px;">
            <i class="fa-solid fa-calendar-xmark" style="font-size:22px;margin-bottom:8px;display:block;"></i>
            No SOAP notes found in this date range for this patient.
          </div>`;
        document.getElementById('invoiceTotals').style.display    = 'none';
        document.getElementById('invoiceAdjustRow').style.display = 'none';
        document.getElementById('piInvoiceDownload').disabled      = true;
        return;
      }

      renderInvoiceLineItems(filtered);
      updateInvoiceTotals();
      document.getElementById('invoiceTotals').style.display    = 'block';
      document.getElementById('invoiceAdjustRow').style.display = 'grid';
      document.getElementById('piInvoiceDownload').disabled      = false;

    } catch (err) {
      console.error('[Invoice] load visits:', err);
      toast('Failed to load visits', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Load Visits';
    }
  }

  function renderInvoiceLineItems(notes) {
    const wrap = document.getElementById('invoiceLineItemsWrap');
    if (!wrap) return;

    wrap.innerHTML = `
      <div class="table-wrapper" style="margin-top:8px;">
        <table>
          <thead>
            <tr>
              <th style="width:30px;">
                <input type="checkbox" id="invoiceSelectAll" checked title="Select/deselect all" />
              </th>
              <th>Date of Service</th>
              <th>CPT Code(s)</th>
              <th>Description of Service</th>
              <th style="width:70px;">Units</th>
              <th style="width:100px;">Rate ($)</th>
              <th style="width:90px;text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody id="invoiceLineItemsBody">
            ${notes.map((note, i) => {
              const dateStr = note.note_date
                ? String(note.note_date).split('T')[0]
                : (note.created_at ? String(note.created_at).split('T')[0] : '');
              const cptCodes = note.cpt_codes || '';
              const desc = getCptDescription(cptCodes);
              return `
                <tr data-idx="${i}">
                  <td><input type="checkbox" class="inv-check" data-idx="${i}" checked /></td>
                  <td style="white-space:nowrap;font-size:13px;">${formatDate(dateStr)}</td>
                  <td style="font-size:12px;font-family:monospace;">${cptCodes || '—'}</td>
                  <td>
                    <input type="text" class="form-control inv-desc" data-idx="${i}"
                      value="${desc.replace(/"/g, '&quot;')}"
                      style="min-width:180px;font-size:12px;padding:4px 8px;" />
                  </td>
                  <td>
                    <input type="number" class="form-control inv-units" data-idx="${i}"
                      value="1" min="0.5" step="0.5"
                      style="width:65px;font-size:12px;padding:4px 8px;" />
                  </td>
                  <td>
                    <input type="number" class="form-control inv-rate" data-idx="${i}"
                      value="0.00" min="0" step="0.01"
                      style="width:95px;font-size:12px;padding:4px 8px;" />
                  </td>
                  <td class="inv-row-total" data-idx="${i}"
                    style="text-align:right;font-weight:600;font-size:13px;">$0.00</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    // Bind change handlers for rate/units/check
    wrap.querySelectorAll('.inv-units, .inv-rate').forEach(el => {
      el.addEventListener('input', updateInvoiceTotals);
    });
    wrap.querySelectorAll('.inv-check').forEach(el => {
      el.addEventListener('change', updateInvoiceTotals);
    });

    const selectAll = document.getElementById('invoiceSelectAll');
    if (selectAll) {
      selectAll.addEventListener('change', function onSelectAll() {
        document.querySelectorAll('.inv-check').forEach(cb => { cb.checked = selectAll.checked; });
        updateInvoiceTotals();
      });
    }

    // Adjustment field live update
    const adjInput = document.getElementById('invoiceAdjustment');
    if (adjInput) adjInput.addEventListener('input', updateInvoiceTotals);
  }

  function updateInvoiceTotals() {
    const tbody = document.getElementById('invoiceLineItemsBody');
    if (!tbody) return;

    let subtotal = 0;
    tbody.querySelectorAll('tr').forEach(row => {
      const checked  = row.querySelector('.inv-check')?.checked;
      const units    = parseFloat(row.querySelector('.inv-units')?.value) || 0;
      const rate     = parseFloat(row.querySelector('.inv-rate')?.value)  || 0;
      const rowTotal = checked ? units * rate : 0;
      subtotal += rowTotal;

      const cell = row.querySelector('.inv-row-total');
      if (cell) cell.textContent = '$' + (checked ? (units * rate).toFixed(2) : '0.00');
    });

    const adj   = parseFloat(document.getElementById('invoiceAdjustment')?.value) || 0;
    const total = subtotal - adj;

    const totalsEl = document.getElementById('invoiceTotals');
    if (!totalsEl) return;

    totalsEl.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;
                  padding:12px 16px;background:var(--bg-mid);border-radius:var(--radius);border:1px solid var(--border);">
        <div style="display:flex;gap:24px;font-size:13px;color:var(--text-muted);">
          <span>Subtotal:</span>
          <span style="font-weight:600;color:var(--text-primary);min-width:90px;text-align:right;">
            ${formatCurrency(subtotal)}
          </span>
        </div>
        ${adj > 0 ? `
        <div style="display:flex;gap:24px;font-size:13px;color:var(--text-muted);">
          <span>Adjustment:</span>
          <span style="font-weight:600;color:var(--danger);min-width:90px;text-align:right;">
            -${formatCurrency(adj)}
          </span>
        </div>` : ''}
        <div style="display:flex;gap:24px;font-size:16px;font-weight:700;color:var(--gold);
                    border-top:1px solid var(--border);padding-top:8px;margin-top:2px;">
          <span>TOTAL DUE:</span>
          <span style="min-width:90px;text-align:right;">${formatCurrency(total)}</span>
        </div>
      </div>`;
  }

  async function downloadInvoicePDF() {
    const tbody = document.getElementById('invoiceLineItemsBody');
    if (!tbody) return;

    const lineItems = [];
    tbody.querySelectorAll('tr').forEach(row => {
      if (!row.querySelector('.inv-check')?.checked) return;
      const idx  = parseInt(row.dataset.idx, 10);
      const note = invoiceNotesList[idx];
      const units = parseFloat(row.querySelector('.inv-units')?.value) || 1;
      const rate  = parseFloat(row.querySelector('.inv-rate')?.value)  || 0;
      const desc  = row.querySelector('.inv-desc')?.value || '';
      const dateStr = note?.note_date
        ? String(note.note_date).split('T')[0]
        : (note?.created_at ? String(note.created_at).split('T')[0] : '');

      lineItems.push({
        date_of_service: dateStr,
        cpt_codes:       note?.cpt_codes || '',
        description:     desc,
        units,
        rate
      });
    });

    if (lineItems.length === 0) {
      toast('Please select at least one visit to include', 'warning');
      return;
    }

    const adjustment    = parseFloat(document.getElementById('invoiceAdjustment')?.value) || 0;
    const invoice_notes = document.getElementById('invoiceNotes')?.value || '';

    const btn = document.getElementById('piInvoiceDownload');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating PDF...';

    try {
      const response = await fetch(`/api/pi-cases/${invoiceCaseId}/invoice`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ line_items: lineItems, adjustment, invoice_notes })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${response.status}`);
      }

      const blob = await response.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `PI-Invoice-Case${invoiceCaseId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast('Invoice downloaded successfully', 'success');
    } catch (err) {
      console.error('[Invoice download]', err);
      toast(err.message || 'Failed to generate invoice', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-file-pdf"></i> Download Invoice PDF';
    }
  }

  // ── Bind Events ───────────────────────────────────────────────────────────
  function bindEvents() {
    document.getElementById('newPIBtn')?.addEventListener('click', openNew);
    document.getElementById('piModalSave')?.addEventListener('click', saveCase);

    document.getElementById('piCaseStatus')?.addEventListener('change', (e) => {
      toggleSettlementField(e.target.value);
    });

    document.getElementById('piFilterChips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;
      document.querySelectorAll('#piFilterChips .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.status;
      renderTable();
    });

    document.getElementById('invoiceLoadVisits')?.addEventListener('click', loadInvoiceVisits);
    document.getElementById('piInvoiceDownload')?.addEventListener('click', downloadInvoicePDF);

    window.App.setupModalClose('piCaseModal',    ['piModalClose',   'piModalCancel']);
    window.App.setupModalClose('piDetailModal',  ['piDetailClose',  'piDetailCancel']);
    window.App.setupModalClose('piInvoiceModal', ['piInvoiceClose', 'piInvoiceCancel']);
  }

  return {
    render,
    openDetail,
    openEdit,
    openInvoice,
    deleteCase,
    refresh: loadAll
  };
})();
