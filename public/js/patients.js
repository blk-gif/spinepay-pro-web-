'use strict';

// ── Patients Module ──────────────────────────────────────────────────────────
window.Patients = (() => {
  const { toast, confirm, statusBadge, openModal, closeModal, formatDate, formatCurrency } = window.App;

  let allPatients = [];
  let filteredPatients = [];
  let sortCol = 'last_name';
  let sortDir = 'asc';
  let currentPatientId = null;
  let editingInsuranceId = null;

  // ── View HTML ──────────────────────────────────────────────────────────────
  function buildPatientListView() {
    return `
      <!-- Patient List View -->
      <div id="patientListView">
        <div class="section-header mb-16">
          <div class="section-title">Patient <span>Registry</span></div>
          <div class="action-row">
            <button class="btn btn-secondary btn-sm" id="importCsvBtn">
              <i class="fa-solid fa-file-csv"></i> Import CSV
            </button>
            <button class="btn btn-primary" id="addPatientBtn">
              <i class="fa-solid fa-user-plus"></i> Add Patient
            </button>
          </div>
        </div>

        <div class="card card-gold">
          <div class="filter-bar">
            <div class="filter-search">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="text" class="form-control" id="patientSearch" placeholder="Search name, phone, email..." />
            </div>
            <select class="form-control" id="patientStatusFilter" style="width:140px;">
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select class="form-control" id="patientGenderFilter" style="width:120px;">
              <option value="">All Gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
            <span class="text-muted" id="patientCount" style="font-size:12px; white-space:nowrap;"></span>
          </div>
          <div class="card-body-flush">
            <div class="table-wrapper">
              <table id="patientsTable">
                <thead>
                  <tr>
                    <th data-sort="last_name">Name <i class="fa-solid fa-sort sort-icon"></i></th>
                    <th data-sort="dob">Date of Birth <i class="fa-solid fa-sort sort-icon"></i></th>
                    <th>Phone</th>
                    <th>Insurance</th>
                    <th data-sort="status">Status <i class="fa-solid fa-sort sort-icon"></i></th>
                    <th data-sort="created_at">Added <i class="fa-solid fa-sort sort-icon"></i></th>
                    <th style="width:100px;">Actions</th>
                  </tr>
                </thead>
                <tbody id="patientsTableBody">
                  <tr><td colspan="7" class="table-empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading...</p></td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Patient Detail View -->
      <div id="patientDetailView" class="hidden">
        <div class="section-header mb-16">
          <button class="btn btn-secondary btn-sm" id="backToListBtn">
            <i class="fa-solid fa-arrow-left"></i> Back to Patients
          </button>
          <div class="action-row">
            <button class="btn btn-outline btn-sm" id="editPatientDetailBtn">
              <i class="fa-solid fa-pen"></i> Edit
            </button>
            <button class="btn btn-danger btn-sm" id="deletePatientDetailBtn">
              <i class="fa-solid fa-trash"></i> Delete
            </button>
          </div>
        </div>

        <div class="patient-detail-header card card-gold mb-16">
          <div class="patient-avatar-lg" id="detailAvatar">JD</div>
          <div class="patient-meta" style="flex:1;">
            <h2 id="detailName">Patient Name</h2>
            <p id="detailSubtitle">DOB • Phone • Email</p>
          </div>
          <div>
            <span id="detailStatusBadge"></span>
          </div>
        </div>

        <div class="card card-gold">
          <div class="tabs" id="patientDetailTabs">
            <button class="tab-btn active" data-tab="info"><i class="fa-solid fa-circle-info"></i> Info</button>
            <button class="tab-btn" data-tab="insurance"><i class="fa-solid fa-shield-halved"></i> Insurance</button>
            <button class="tab-btn" data-tab="visits"><i class="fa-solid fa-calendar-check"></i> Visit History</button>
            <button class="tab-btn" data-tab="claims"><i class="fa-solid fa-file-invoice-dollar"></i> Claims</button>
          </div>

          <div class="tab-pane active" id="tab-info">
            <div class="card-body">
              <div class="info-grid" id="detailInfoGrid"></div>
            </div>
          </div>

          <div class="tab-pane" id="tab-insurance">
            <div class="card-header" style="border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);">
              <div class="card-title">Insurance Plans</div>
              <button class="btn btn-sm btn-primary" id="addInsuranceBtn">
                <i class="fa-solid fa-plus"></i> Add Insurance
              </button>
            </div>
            <div class="card-body" id="insuranceTabContent"></div>
          </div>

          <div class="tab-pane" id="tab-visits">
            <div class="card-body-flush">
              <div class="table-wrapper" id="visitsTabContent">
                <div class="table-empty"><i class="fa-regular fa-calendar"></i><p>No visit history</p></div>
              </div>
            </div>
          </div>

          <div class="tab-pane" id="tab-claims">
            <div class="card-body-flush">
              <div class="table-wrapper" id="claimsTabContent">
                <div class="table-empty"><i class="fa-regular fa-file"></i><p>No claims found</p></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Add/Edit Patient Modal -->
      <div class="modal-overlay" id="patientModal">
        <div class="modal modal-lg">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-user"></i> <span id="patientModalTitle">Add Patient</span></div>
            <button class="modal-close" id="patientModalClose">&times;</button>
          </div>
          <div class="modal-body">
            <form id="patientForm">
              <div style="font-size:12px; font-weight:600; color:var(--gold); text-transform:uppercase; letter-spacing:.8px; margin-bottom:12px;">Personal Information</div>
              <div class="form-grid form-grid-3" style="margin-bottom:16px;">
                <div class="form-group">
                  <label class="form-label">First Name <span class="required">*</span></label>
                  <input type="text" class="form-control" id="pFirstName" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Last Name <span class="required">*</span></label>
                  <input type="text" class="form-control" id="pLastName" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Date of Birth</label>
                  <input type="date" class="form-control" id="pDob" />
                </div>
                <div class="form-group">
                  <label class="form-label">Gender</label>
                  <select class="form-control" id="pGender">
                    <option value="">Select...</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="prefer_not">Prefer not to say</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Phone <span class="required">*</span></label>
                  <input type="tel" class="form-control" id="pPhone" placeholder="716-555-0000" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Email</label>
                  <input type="email" class="form-control" id="pEmail" placeholder="patient@email.com" />
                </div>
              </div>

              <div class="divider-h"></div>
              <div style="font-size:12px; font-weight:600; color:var(--gold); text-transform:uppercase; letter-spacing:.8px; margin-bottom:12px;">Address</div>
              <div class="form-grid" style="margin-bottom:16px;">
                <div class="form-group full-width">
                  <label class="form-label">Street Address</label>
                  <input type="text" class="form-control" id="pAddress" placeholder="123 Main Street" />
                </div>
                <div class="form-group">
                  <label class="form-label">City</label>
                  <input type="text" class="form-control" id="pCity" value="Buffalo" />
                </div>
                <div class="form-group">
                  <label class="form-label">State</label>
                  <input type="text" class="form-control" id="pState" value="NY" maxlength="2" />
                </div>
                <div class="form-group">
                  <label class="form-label">ZIP Code</label>
                  <input type="text" class="form-control" id="pZip" placeholder="14201" maxlength="10" />
                </div>
              </div>

              <div class="divider-h"></div>
              <div style="font-size:12px; font-weight:600; color:var(--gold); text-transform:uppercase; letter-spacing:.8px; margin-bottom:12px;">Emergency Contact</div>
              <div class="form-grid form-grid-2" style="margin-bottom:16px;">
                <div class="form-group">
                  <label class="form-label">Contact Name</label>
                  <input type="text" class="form-control" id="pEmergencyContact" />
                </div>
                <div class="form-group">
                  <label class="form-label">Contact Phone</label>
                  <input type="tel" class="form-control" id="pEmergencyPhone" />
                </div>
              </div>

              <div class="divider-h"></div>
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label">Status</label>
                  <select class="form-control" id="pStatus">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Notes</label>
                  <textarea class="form-control" id="pNotes" rows="2" placeholder="Optional patient notes..."></textarea>
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="patientModalCancel">Cancel</button>
            <button class="btn btn-primary" id="patientModalSave">
              <i class="fa-solid fa-floppy-disk"></i> Save Patient
            </button>
          </div>
        </div>
      </div>

      <!-- Insurance Modal -->
      <div class="modal-overlay" id="insuranceModal">
        <div class="modal modal-md">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-shield-halved"></i> <span id="insuranceModalTitle">Add Insurance</span></div>
            <button class="modal-close" id="insuranceModalClose">&times;</button>
          </div>
          <div class="modal-body">
            <form id="insuranceForm">
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label">Type</label>
                  <select class="form-control" id="insType">
                    <option value="primary">Primary</option>
                    <option value="secondary">Secondary</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Insurance Provider <span class="required">*</span></label>
                  <select class="form-control" id="insProvider" required>
                    <option value="">Select Provider...</option>
                    <option>BlueCross Blue Shield</option>
                    <option>Aetna</option>
                    <option>UnitedHealth</option>
                    <option>Cigna</option>
                    <option>Medicare</option>
                    <option>Medicaid</option>
                    <option>Humana</option>
                    <option>Anthem</option>
                    <option>Other</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Policy Number</label>
                  <input type="text" class="form-control" id="insPolicyNumber" />
                </div>
                <div class="form-group">
                  <label class="form-label">Group Number</label>
                  <input type="text" class="form-control" id="insGroupNumber" />
                </div>
                <div class="form-group">
                  <label class="form-label">Subscriber Name</label>
                  <input type="text" class="form-control" id="insSubscriberName" />
                </div>
                <div class="form-group">
                  <label class="form-label">Subscriber DOB</label>
                  <input type="date" class="form-control" id="insSubscriberDob" />
                </div>
                <div class="form-group">
                  <label class="form-label">Subscriber ID</label>
                  <input type="text" class="form-control" id="insSubscriberId" />
                </div>
                <div class="form-group">
                  <label class="form-label">Relationship to Subscriber</label>
                  <select class="form-control" id="insRelationship">
                    <option value="self">Self</option>
                    <option value="spouse">Spouse</option>
                    <option value="child">Child</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Copay ($)</label>
                  <input type="number" class="form-control" id="insCopay" min="0" step="0.01" value="0" />
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="insuranceModalCancel">Cancel</button>
            <button class="btn btn-primary" id="insuranceModalSave">
              <i class="fa-solid fa-floppy-disk"></i> Save Insurance
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  async function render() {
    const view = document.getElementById('view-patients');
    if (!view.querySelector('#patientListView')) {
      view.innerHTML = buildPatientListView();
      bindPatientListEvents();
    }
    showList();
    await loadPatients();
  }

  function showList() {
    document.getElementById('patientListView').classList.remove('hidden');
    document.getElementById('patientDetailView').classList.add('hidden');
  }

  function showDetail() {
    document.getElementById('patientListView').classList.add('hidden');
    document.getElementById('patientDetailView').classList.remove('hidden');
  }

  // ── Load & Render Table ────────────────────────────────────────────────────
  async function loadPatients() {
    try {
      allPatients = await window.api.patients.getAll();
      applyFilters();
    } catch (err) {
      console.error(err);
      toast('Failed to load patients', 'error');
    }
  }

  function applyFilters() {
    const searchQ = (document.getElementById('patientSearch')?.value || '').toLowerCase();
    const statusF = document.getElementById('patientStatusFilter')?.value || '';
    const genderF = document.getElementById('patientGenderFilter')?.value || '';

    filteredPatients = allPatients.filter(p => {
      const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
      const matchSearch = !searchQ ||
        fullName.includes(searchQ) ||
        (p.phone || '').includes(searchQ) ||
        (p.email || '').toLowerCase().includes(searchQ);
      const matchStatus = !statusF || p.status === statusF;
      const matchGender = !genderF || p.gender === genderF;
      return matchSearch && matchStatus && matchGender;
    });

    // Sort
    filteredPatients.sort((a, b) => {
      let va = a[sortCol] || '', vb = b[sortCol] || '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    renderTable();
    document.getElementById('patientCount').textContent = `${filteredPatients.length} of ${allPatients.length} patients`;
  }

  function renderTable() {
    const tbody = document.getElementById('patientsTableBody');
    if (filteredPatients.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="table-empty"><i class="fa-solid fa-users-slash"></i><p>No patients found</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = filteredPatients.map(p => {
      const name = `${p.last_name}, ${p.first_name}`;
      const initials = `${p.first_name[0]}${p.last_name[0]}`;
      return `
        <tr class="clickable" onclick="window.Patients.openPatientDetail(${p.id})">
          <td>
            <div style="display:flex;align-items:center;gap:10px;">
              <div class="user-avatar" style="width:30px;height:30px;font-size:11px;flex-shrink:0;">${initials}</div>
              <span class="td-primary">${name}</span>
            </div>
          </td>
          <td>${window.App.formatDate(p.dob)}</td>
          <td>${p.phone || '—'}</td>
          <td><span class="text-muted" style="font-size:12px;">—</span></td>
          <td>${statusBadge(p.status || 'active')}</td>
          <td>${window.App.formatDate(p.created_at)}</td>
          <td onclick="event.stopPropagation()">
            <div class="action-row" style="gap:4px;">
              <button class="btn btn-icon btn-sm btn-outline" title="Edit" onclick="window.Patients.openEditPatient(${p.id})">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="btn btn-icon btn-sm btn-danger" title="Delete" onclick="window.Patients.deletePatient(${p.id})">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // ── Patient Detail ─────────────────────────────────────────────────────────
  async function openPatientDetail(patientId) {
    try {
      currentPatientId = patientId;
      const patient = await window.api.patients.getById(patientId);
      if (!patient) { toast('Patient not found', 'error'); return; }

      // Switch to patients module if needed
      if (!document.getElementById('patientDetailView')) await render();

      const initials = `${patient.first_name[0]}${patient.last_name[0]}`;
      document.getElementById('detailAvatar').textContent = initials;
      document.getElementById('detailName').textContent = `${patient.first_name} ${patient.last_name}`;
      document.getElementById('detailSubtitle').textContent = [
        patient.dob ? `DOB: ${window.App.formatDate(patient.dob)}` : null,
        patient.phone,
        patient.email
      ].filter(Boolean).join(' • ');
      document.getElementById('detailStatusBadge').innerHTML = statusBadge(patient.status || 'active');

      document.getElementById('detailInfoGrid').innerHTML = `
        <div class="info-item"><div class="info-label">First Name</div><div class="info-value">${patient.first_name}</div></div>
        <div class="info-item"><div class="info-label">Last Name</div><div class="info-value">${patient.last_name}</div></div>
        <div class="info-item"><div class="info-label">Date of Birth</div><div class="info-value">${window.App.formatDate(patient.dob)}</div></div>
        <div class="info-item"><div class="info-label">Gender</div><div class="info-value" style="text-transform:capitalize;">${patient.gender || '—'}</div></div>
        <div class="info-item"><div class="info-label">Phone</div><div class="info-value">${patient.phone || '—'}</div></div>
        <div class="info-item"><div class="info-label">Email</div><div class="info-value">${patient.email || '—'}</div></div>
        <div class="info-item"><div class="info-label">Address</div><div class="info-value">${patient.address || '—'}</div></div>
        <div class="info-item"><div class="info-label">City</div><div class="info-value">${patient.city || '—'}</div></div>
        <div class="info-item"><div class="info-label">State</div><div class="info-value">${patient.state || '—'}</div></div>
        <div class="info-item"><div class="info-label">ZIP</div><div class="info-value">${patient.zip || '—'}</div></div>
        <div class="info-item"><div class="info-label">Emergency Contact</div><div class="info-value">${patient.emergency_contact || '—'}</div></div>
        <div class="info-item"><div class="info-label">Emergency Phone</div><div class="info-value">${patient.emergency_phone || '—'}</div></div>
        ${patient.notes ? `<div class="info-item full-width" style="grid-column:1/-1;"><div class="info-label">Notes</div><div class="info-value">${patient.notes}</div></div>` : ''}
      `;

      // Load tabs
      loadInsuranceTab(patientId);
      loadVisitsTab(patientId);
      loadClaimsTab(patientId);

      // Tab switching
      document.querySelectorAll('#patientDetailTabs .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#patientDetailTabs .tab-btn').forEach(b => b.classList.remove('active'));
          document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
          btn.classList.add('active');
          document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
        });
      });

      // Detail action buttons
      document.getElementById('editPatientDetailBtn').onclick = () => openEditPatient(patientId);
      document.getElementById('deletePatientDetailBtn').onclick = () => deletePatient(patientId, true);
      document.getElementById('backToListBtn').onclick = showList;

      showDetail();
    } catch (err) {
      console.error(err);
      toast('Failed to load patient details', 'error');
    }
  }

  async function loadInsuranceTab(patientId) {
    const container = document.getElementById('insuranceTabContent');
    try {
      const insurance = await window.api.insurance.getByPatient(patientId);
      if (insurance.length === 0) {
        container.innerHTML = `<div class="table-empty"><i class="fa-solid fa-shield-halved"></i><p>No insurance on file. Click "Add Insurance" to add.</p></div>`;
        return;
      }
      container.innerHTML = insurance.map(ins => `
        <div class="info-grid mb-12" style="padding:16px; background:var(--bg-mid); border:1px solid var(--border); border-radius:var(--radius); margin-bottom:10px;">
          <div style="grid-column:1/-1; display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div style="font-weight:700; color:var(--gold);">
              <i class="fa-solid fa-shield-halved"></i> ${ins.provider} — <span style="text-transform:capitalize;">${ins.type}</span>
            </div>
            <div class="action-row" style="gap:6px;">
              <button class="btn btn-sm btn-outline" onclick="window.Patients.openEditInsurance(${ins.id})">
                <i class="fa-solid fa-pen"></i> Edit
              </button>
              <button class="btn btn-sm btn-danger" onclick="window.Patients.deleteInsurance(${ins.id})">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>
          <div class="info-item"><div class="info-label">Policy #</div><div class="info-value">${ins.policy_number || '—'}</div></div>
          <div class="info-item"><div class="info-label">Group #</div><div class="info-value">${ins.group_number || '—'}</div></div>
          <div class="info-item"><div class="info-label">Subscriber</div><div class="info-value">${ins.subscriber_name || '—'}</div></div>
          <div class="info-item"><div class="info-label">Relationship</div><div class="info-value" style="text-transform:capitalize;">${ins.relationship || '—'}</div></div>
          <div class="info-item"><div class="info-label">Copay</div><div class="info-value">${formatCurrency(ins.copay)}</div></div>
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = '<div class="table-empty"><p>Failed to load insurance</p></div>';
    }
  }

  async function loadVisitsTab(patientId) {
    const container = document.getElementById('visitsTabContent');
    try {
      const visits = await window.api.appointments.getByPatient(patientId);
      if (visits.length === 0) {
        container.innerHTML = `<div class="table-empty"><i class="fa-regular fa-calendar"></i><p>No appointments found</p></div>`;
        return;
      }
      container.innerHTML = `
        <table>
          <thead>
            <tr><th>Date</th><th>Time</th><th>Type</th><th>Provider</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${visits.map(v => `
              <tr>
                <td class="td-primary">${window.App.formatDate(v.date)}</td>
                <td>${window.App.formatTime(v.time)}</td>
                <td style="text-transform:capitalize;">${v.type?.replace(/-/g, ' ') || '—'}</td>
                <td>${v.provider || '—'}</td>
                <td>${statusBadge(v.status)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
    } catch (err) {
      container.innerHTML = '<div class="table-empty"><p>Failed to load visits</p></div>';
    }
  }

  async function loadClaimsTab(patientId) {
    const container = document.getElementById('claimsTabContent');
    try {
      const claims = await window.api.claims.getByPatient(patientId);
      if (claims.length === 0) {
        container.innerHTML = `<div class="table-empty"><i class="fa-regular fa-file"></i><p>No claims found</p></div>`;
        return;
      }
      container.innerHTML = `
        <table>
          <thead>
            <tr><th>Claim #</th><th>Insurer</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${claims.map(c => `
              <tr>
                <td class="td-primary">${c.claim_number || '—'}</td>
                <td>${c.insurer || '—'}</td>
                <td>${formatCurrency(c.amount)}</td>
                <td class="text-success">${formatCurrency(c.paid_amount)}</td>
                <td class="text-warning">${formatCurrency(c.amount - c.paid_amount)}</td>
                <td>${statusBadge(c.status)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
    } catch (err) {
      container.innerHTML = '<div class="table-empty"><p>Failed to load claims</p></div>';
    }
  }

  // ── Add / Edit Patient ─────────────────────────────────────────────────────
  function openAddPatient() {
    currentPatientId = null;
    document.getElementById('patientModalTitle').textContent = 'Add Patient';
    document.getElementById('patientForm').reset();
    document.getElementById('pCity').value = 'Buffalo';
    document.getElementById('pState').value = 'NY';
    openModal('patientModal');
  }

  async function openEditPatient(id) {
    try {
      const p = await window.api.patients.getById(id);
      if (!p) return;
      currentPatientId = id;
      document.getElementById('patientModalTitle').textContent = 'Edit Patient';
      document.getElementById('pFirstName').value = p.first_name || '';
      document.getElementById('pLastName').value = p.last_name || '';
      document.getElementById('pDob').value = p.dob || '';
      document.getElementById('pGender').value = p.gender || '';
      document.getElementById('pPhone').value = p.phone || '';
      document.getElementById('pEmail').value = p.email || '';
      document.getElementById('pAddress').value = p.address || '';
      document.getElementById('pCity').value = p.city || 'Buffalo';
      document.getElementById('pState').value = p.state || 'NY';
      document.getElementById('pZip').value = p.zip || '';
      document.getElementById('pEmergencyContact').value = p.emergency_contact || '';
      document.getElementById('pEmergencyPhone').value = p.emergency_phone || '';
      document.getElementById('pNotes').value = p.notes || '';
      document.getElementById('pStatus').value = p.status || 'active';
      openModal('patientModal');
    } catch (err) {
      toast('Failed to load patient data', 'error');
    }
  }

  async function savePatient() {
    const firstName = document.getElementById('pFirstName').value.trim();
    const lastName  = document.getElementById('pLastName').value.trim();
    const phone     = document.getElementById('pPhone').value.trim();

    if (!firstName || !lastName) { toast('First and last name are required', 'warning'); return; }
    if (!phone) { toast('Phone number is required', 'warning'); return; }

    const data = {
      first_name:        firstName,
      last_name:         lastName,
      dob:               document.getElementById('pDob').value || null,
      gender:            document.getElementById('pGender').value || null,
      phone,
      email:             document.getElementById('pEmail').value.trim() || null,
      address:           document.getElementById('pAddress').value.trim() || null,
      city:              document.getElementById('pCity').value.trim() || null,
      state:             document.getElementById('pState').value.trim() || null,
      zip:               document.getElementById('pZip').value.trim() || null,
      emergency_contact: document.getElementById('pEmergencyContact').value.trim() || null,
      emergency_phone:   document.getElementById('pEmergencyPhone').value.trim() || null,
      notes:             document.getElementById('pNotes').value.trim() || null,
      status:            document.getElementById('pStatus').value || 'active'
    };

    const btn = document.getElementById('patientModalSave');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
      if (currentPatientId) {
        await window.api.patients.update(currentPatientId, data);
        toast('Patient updated successfully', 'success');
      } else {
        const result = await window.api.patients.create(data);
        toast('Patient added successfully', 'success');
        currentPatientId = result.id;
      }
      closeModal('patientModal');
      await loadPatients();
    } catch (err) {
      console.error(err);
      toast('Failed to save patient', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Patient';
    }
  }

  async function deletePatient(id, goBack = false) {
    const confirmed = await confirm(
      'Are you sure you want to delete this patient? All associated appointments, claims, and records will also be deleted.',
      'Delete Patient',
      'btn-danger'
    );
    if (!confirmed) return;

    try {
      await window.api.patients.delete(id);
      toast('Patient deleted', 'success');
      await loadPatients();
      if (goBack) showList();
    } catch (err) {
      toast('Failed to delete patient', 'error');
    }
  }

  // ── Insurance CRUD ─────────────────────────────────────────────────────────
  function openAddInsurance() {
    editingInsuranceId = null;
    document.getElementById('insuranceModalTitle').textContent = 'Add Insurance';
    document.getElementById('insuranceForm').reset();
    openModal('insuranceModal');
  }

  async function openEditInsurance(id) {
    try {
      const insurance = await window.api.insurance.getByPatient(currentPatientId);
      const ins = insurance.find(i => i.id === id);
      if (!ins) return;
      editingInsuranceId = id;
      document.getElementById('insuranceModalTitle').textContent = 'Edit Insurance';
      document.getElementById('insType').value = ins.type || 'primary';
      document.getElementById('insProvider').value = ins.provider || '';
      document.getElementById('insPolicyNumber').value = ins.policy_number || '';
      document.getElementById('insGroupNumber').value = ins.group_number || '';
      document.getElementById('insSubscriberName').value = ins.subscriber_name || '';
      document.getElementById('insSubscriberDob').value = ins.subscriber_dob || '';
      document.getElementById('insSubscriberId').value = ins.subscriber_id || '';
      document.getElementById('insRelationship').value = ins.relationship || 'self';
      document.getElementById('insCopay').value = ins.copay || 0;
      openModal('insuranceModal');
    } catch (err) {
      toast('Failed to load insurance data', 'error');
    }
  }

  async function saveInsurance() {
    const provider = document.getElementById('insProvider').value;
    if (!provider) { toast('Please select an insurance provider', 'warning'); return; }

    const data = {
      patient_id:      currentPatientId,
      type:            document.getElementById('insType').value,
      provider,
      policy_number:   document.getElementById('insPolicyNumber').value.trim() || null,
      group_number:    document.getElementById('insGroupNumber').value.trim() || null,
      subscriber_name: document.getElementById('insSubscriberName').value.trim() || null,
      subscriber_dob:  document.getElementById('insSubscriberDob').value || null,
      subscriber_id:   document.getElementById('insSubscriberId').value.trim() || null,
      relationship:    document.getElementById('insRelationship').value,
      copay:           parseFloat(document.getElementById('insCopay').value) || 0
    };

    try {
      if (editingInsuranceId) {
        await window.api.insurance.update(editingInsuranceId, data);
        toast('Insurance updated', 'success');
      } else {
        await window.api.insurance.create(data);
        toast('Insurance added', 'success');
      }
      closeModal('insuranceModal');
      loadInsuranceTab(currentPatientId);
    } catch (err) {
      toast('Failed to save insurance', 'error');
    }
  }

  async function deleteInsurance(id) {
    const confirmed = await confirm('Remove this insurance plan?', 'Remove', 'btn-danger');
    if (!confirmed) return;
    try {
      await window.api.insurance.delete(id);
      toast('Insurance removed', 'success');
      loadInsuranceTab(currentPatientId);
    } catch (err) {
      toast('Failed to remove insurance', 'error');
    }
  }

  // ── CSV Import ─────────────────────────────────────────────────────────────
  async function importCsv() {
    try {
      const result = await window.api.file.showOpenDialog({
        filters: [{ name: 'CSV Files', extensions: ['csv'] }],
        properties: ['openFile']
      });
      if (!result) return;

      const lines = result.content.split('\n').filter(l => l.trim());
      if (lines.length < 2) { toast('CSV file is empty or invalid', 'warning'); return; }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, '_'));
      const rows = [];

      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        if (vals.length < 2) continue;
        const row = {};
        headers.forEach((h, idx) => { row[h] = vals[idx] || null; });

        rows.push({
          first_name: row.first_name || row.firstname || row.first || 'Unknown',
          last_name:  row.last_name  || row.lastname  || row.last  || 'Unknown',
          dob:        row.dob || row.date_of_birth || null,
          gender:     row.gender || null,
          phone:      row.phone || row.phone_number || null,
          email:      row.email || null,
          address:    row.address || null,
          city:       row.city || 'Buffalo',
          state:      row.state || 'NY',
          zip:        row.zip || row.zipcode || null
        });
      }

      if (rows.length === 0) { toast('No valid rows found in CSV', 'warning'); return; }

      const res = await window.api.patients.importCsv(rows);
      toast(`Successfully imported ${res.count} patients`, 'success');
      await loadPatients();
    } catch (err) {
      console.error(err);
      toast('CSV import failed', 'error');
    }
  }

  // ── Bind Events ───────────────────────────────────────────────────────────
  function bindPatientListEvents() {
    // Search & filters
    document.getElementById('patientSearch')?.addEventListener('input', () => {
      clearTimeout(window._patientSearchTimer);
      window._patientSearchTimer = setTimeout(applyFilters, 200);
    });
    document.getElementById('patientStatusFilter')?.addEventListener('change', applyFilters);
    document.getElementById('patientGenderFilter')?.addEventListener('change', applyFilters);

    // Sort columns
    document.querySelectorAll('#patientsTable thead th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        if (sortCol === th.dataset.sort) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else { sortCol = th.dataset.sort; sortDir = 'asc'; }
        document.querySelectorAll('#patientsTable thead th').forEach(t => t.classList.remove('sorted'));
        th.classList.add('sorted');
        th.querySelector('.sort-icon').className = `fa-solid fa-sort-${sortDir === 'asc' ? 'up' : 'down'} sort-icon`;
        applyFilters();
      });
    });

    // Buttons
    document.getElementById('addPatientBtn')?.addEventListener('click', openAddPatient);
    document.getElementById('importCsvBtn')?.addEventListener('click', importCsv);
    document.getElementById('addInsuranceBtn')?.addEventListener('click', openAddInsurance);

    // Modal save
    document.getElementById('patientModalSave')?.addEventListener('click', savePatient);
    document.getElementById('insuranceModalSave')?.addEventListener('click', saveInsurance);

    // Modal close
    window.App.setupModalClose('patientModal',   ['patientModalClose', 'patientModalCancel']);
    window.App.setupModalClose('insuranceModal', ['insuranceModalClose', 'insuranceModalCancel']);
  }

  // ── Public ─────────────────────────────────────────────────────────────────
  return {
    render,
    openPatientDetail,
    openEditPatient,
    deletePatient,
    openEditInsurance,
    deleteInsurance,
    refresh: loadPatients
  };
})();
