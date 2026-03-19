'use strict';

// ── EOB & Payment Receipts Module ─────────────────────────────────────────────
window.EOB = (() => {
  const { toast, confirm, openModal, closeModal, setupModalClose,
          formatDate, formatCurrency, getCurrentUser, todayString } = window.App;

  let allEOBs     = [];
  let allPayments = [];
  let allPatients = [];
  let activeTab   = 'eob';

  const PAYMENT_METHODS = ['cash', 'card', 'check', 'insurance'];

  // ── Build HTML ──────────────────────────────────────────────────────────────
  function buildHTML() {
    return `
      <div class="card card-gold">
        <div class="tabs" id="eobTabs">
          <button class="tab-btn active" data-tab="eob">
            <i class="fa-solid fa-file-invoice"></i> EOB Records
          </button>
          <button class="tab-btn" data-tab="receipts">
            <i class="fa-solid fa-receipt"></i> Payment Receipts
          </button>
        </div>

        <!-- EOB Records Tab -->
        <div class="tab-pane active" id="eob-tab-eob">
          <div class="filter-bar">
            <div class="filter-search">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="text" class="form-control" id="eobSearch" placeholder="Search patient, claim #, insurer..." />
            </div>
            <label style="display:flex;align-items:center;gap:7px;font-size:13px;color:var(--text-secondary);cursor:pointer;white-space:nowrap;">
              <input type="checkbox" id="eobDiscrepancyFilter" style="width:15px;height:15px;accent-color:#e74c3c;cursor:pointer;" />
              <span><i class="fa-solid fa-triangle-exclamation" style="color:#e74c3c;margin-right:4px;"></i>Show only discrepancies</span>
            </label>
            <div style="flex:1;"></div>
            <button class="btn btn-primary btn-sm" id="newEOBBtn">
              <i class="fa-solid fa-plus"></i> Record EOB
            </button>
          </div>
          <div class="table-wrapper">
            <table id="eobTable">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Insurer</th>
                  <th>Claim #</th>
                  <th>Billed</th>
                  <th>Allowed</th>
                  <th>Paid</th>
                  <th>Patient Resp.</th>
                  <th>Status</th>
                  <th style="width:80px;">Actions</th>
                </tr>
              </thead>
              <tbody id="eobTableBody">
                <tr><td colspan="9"><div class="table-empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading...</p></div></td></tr>
              </tbody>
            </table>
          </div>
          <div id="eobSummary" style="display:flex;gap:24px;padding:12px 20px;border-top:1px solid var(--border);background:var(--bg-mid);font-size:12px;color:var(--text-muted);"></div>
        </div>

        <!-- Payment Receipts Tab -->
        <div class="tab-pane" id="eob-tab-receipts">
          <div class="filter-bar">
            <div class="filter-search">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="text" class="form-control" id="receiptSearch" placeholder="Search patient, reference..." />
            </div>
            <select class="form-control" id="receiptMethodFilter" style="width:140px;">
              <option value="">All Methods</option>
              ${PAYMENT_METHODS.map(m => `<option value="${m}">${m.charAt(0).toUpperCase()+m.slice(1)}</option>`).join('')}
            </select>
            <div style="flex:1;"></div>
            <button class="btn btn-success btn-sm" id="recordPaymentEOBBtn">
              <i class="fa-solid fa-plus"></i> Record Payment
            </button>
          </div>
          <div class="table-wrapper">
            <table id="receiptsTable">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Patient</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th style="width:90px;">Actions</th>
                </tr>
              </thead>
              <tbody id="receiptsTableBody">
                <tr><td colspan="6"><div class="table-empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading...</p></div></td></tr>
              </tbody>
            </table>
          </div>
          <div id="receiptsSummary" style="display:flex;gap:24px;padding:12px 20px;border-top:1px solid var(--border);background:var(--bg-mid);font-size:12px;color:var(--text-muted);"></div>
        </div>
      </div>

      <!-- Record EOB Modal -->
      <div class="modal-overlay" id="eobModal">
        <div class="modal modal-lg">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-file-invoice"></i> Record EOB</div>
            <button class="modal-close" id="eobModalClose">&times;</button>
          </div>
          <div class="modal-body">
            <form id="eobForm">
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label">Patient <span class="required">*</span></label>
                  <select class="form-control" id="eobPatient" required>
                    <option value="">Select patient...</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Linked Claim</label>
                  <select class="form-control" id="eobClaim">
                    <option value="">Select claim (optional)...</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Insurer <span class="required">*</span></label>
                  <input type="text" class="form-control" id="eobInsurer" required placeholder="Insurance company name" />
                </div>
                <div class="form-group">
                  <label class="form-label">Received Date</label>
                  <input type="date" class="form-control" id="eobReceivedDate" />
                </div>
                <div class="form-group">
                  <label class="form-label">Billed Amount ($) <span class="required">*</span></label>
                  <input type="number" class="form-control" id="eobBilled" min="0" step="0.01" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Allowed Amount ($)</label>
                  <input type="number" class="form-control" id="eobAllowed" min="0" step="0.01" value="0" />
                </div>
                <div class="form-group">
                  <label class="form-label">Paid Amount ($)</label>
                  <input type="number" class="form-control" id="eobPaid" min="0" step="0.01" value="0" />
                </div>
                <div class="form-group">
                  <label class="form-label">Patient Responsibility ($)</label>
                  <input type="number" class="form-control" id="eobPatientResp" min="0" step="0.01" value="0" />
                </div>
                <div class="form-group full-width">
                  <label class="form-label">Adjustment Reason</label>
                  <textarea class="form-control" id="eobAdjustmentReason" rows="2" placeholder="Reason for any adjustments, CO codes, etc."></textarea>
                </div>
                <div class="form-group full-width" id="eobDiscrepancyNoteWrap" style="display:none;">
                  <div style="padding:10px 14px;background:rgba(231,76,60,0.08);border:1px solid rgba(231,76,60,0.25);border-radius:var(--radius-sm);margin-bottom:10px;font-size:12px;color:#e74c3c;">
                    <i class="fa-solid fa-triangle-exclamation" style="margin-right:6px;"></i>
                    <strong>Discrepancy Detected:</strong> The amounts entered differ from the original claim amounts.
                  </div>
                  <label class="form-label">Discrepancy Notes</label>
                  <textarea class="form-control" id="eobDiscrepancyNotes" rows="2" placeholder="Describe the discrepancy, next steps, or escalation details..."></textarea>
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="eobModalCancel">Cancel</button>
            <button class="btn btn-primary" id="eobModalSave">
              <i class="fa-solid fa-floppy-disk"></i> Save EOB
            </button>
          </div>
        </div>
      </div>

      <!-- Record Payment Modal -->
      <div class="modal-overlay" id="eobPaymentModal">
        <div class="modal modal-md">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-money-bill-wave"></i> Record Payment</div>
            <button class="modal-close" id="eobPaymentModalClose">&times;</button>
          </div>
          <div class="modal-body">
            <form id="eobPaymentForm">
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label">Patient <span class="required">*</span></label>
                  <select class="form-control" id="eobPaymentPatient" required>
                    <option value="">Select patient...</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Amount ($) <span class="required">*</span></label>
                  <input type="number" class="form-control" id="eobPaymentAmount" min="0.01" step="0.01" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Payment Method</label>
                  <select class="form-control" id="eobPaymentMethod">
                    ${PAYMENT_METHODS.map(m => `<option value="${m}">${m.charAt(0).toUpperCase()+m.slice(1)}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Reference / Check # </label>
                  <input type="text" class="form-control" id="eobPaymentReference" />
                </div>
                <div class="form-group">
                  <label class="form-label">Date <span class="required">*</span></label>
                  <input type="date" class="form-control" id="eobPaymentDate" required />
                </div>
                <div class="form-group full-width">
                  <label class="form-label">Notes</label>
                  <textarea class="form-control" id="eobPaymentNotes" rows="2"></textarea>
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="eobPaymentModalCancel">Cancel</button>
            <button class="btn btn-success" id="eobPaymentModalSave">
              <i class="fa-solid fa-check"></i> Record Payment
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  async function render() {
    const view = document.getElementById('view-eob');
    if (!view.querySelector('.card')) {
      view.innerHTML = buildHTML();
      bindEvents();
    }
    allPatients = await window.api.patients.getAll();
    populatePatientSelects();
    await loadAll();
  }

  async function loadAll() {
    try {
      [allEOBs, allPayments] = await Promise.all([
        window.api.eob.getAll(),
        window.api.payments.getAll()
      ]);
      renderEOBTable();
      renderReceiptsTable();
    } catch (err) {
      console.error(err);
      toast('Failed to load EOB data', 'error');
    }
  }

  function populatePatientSelects() {
    const sorted = [...allPatients].sort((a, b) => a.last_name.localeCompare(b.last_name));
    const opts = '<option value="">Select patient...</option>' +
      sorted.map(p => `<option value="${p.id}">${p.last_name}, ${p.first_name}</option>`).join('');
    ['eobPatient', 'eobPaymentPatient'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = opts;
    });
  }

  // ── EOB Table ───────────────────────────────────────────────────────────────
  function renderEOBTable() {
    const search       = (document.getElementById('eobSearch')?.value || '').toLowerCase();
    const discrepOnly  = document.getElementById('eobDiscrepancyFilter')?.checked;

    let filtered = allEOBs.filter(e => {
      const name     = `${e.first_name || ''} ${e.last_name || ''}`.toLowerCase();
      const insurer  = (e.insurer || '').toLowerCase();
      const claimNum = (e.claim_number || '').toLowerCase();
      const matchSearch = !search || name.includes(search) || insurer.includes(search) || claimNum.includes(search);
      const matchDiscrep = !discrepOnly || e.discrepancy_flag === 1;
      return matchSearch && matchDiscrep;
    });

    filtered = filtered.sort((a, b) => new Date(b.received_date || b.created_at || 0) - new Date(a.received_date || a.created_at || 0));

    const tbody = document.getElementById('eobTableBody');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="table-empty"><i class="fa-regular fa-file-lines"></i><p>No EOB records found</p></div></td></tr>`;
    } else {
      tbody.innerHTML = filtered.map(e => {
        const isDiscrep = e.discrepancy_flag === 1;
        const rowClass  = isDiscrep ? 'eob-discrepancy' : 'eob-matched';
        const discIcon  = isDiscrep
          ? `<i class="fa-solid fa-triangle-exclamation" title="Discrepancy detected" style="color:#e74c3c;margin-left:6px;"></i>`
          : '';
        return `<tr class="${rowClass}">
          <td class="td-primary">${e.first_name || ''} ${e.last_name || ''}</td>
          <td style="font-size:12px;">${e.insurer || '—'}</td>
          <td style="font-size:12px;font-family:monospace;">${e.claim_number || '—'}</td>
          <td>${formatCurrency(e.billed_amount)}</td>
          <td>${formatCurrency(e.allowed_amount)}</td>
          <td class="text-success" style="font-weight:600;">${formatCurrency(e.paid_amount)}</td>
          <td class="${(e.patient_responsibility || 0) > 0 ? 'text-warning' : ''}">${formatCurrency(e.patient_responsibility)}</td>
          <td>${e.discrepancy_flag ? `<span class="badge" style="background:rgba(231,76,60,0.2);color:#e74c3c;border:1px solid rgba(231,76,60,0.3);">Discrepancy${discIcon}</span>` : `<span class="badge badge-active">Matched</span>`}</td>
          <td onclick="event.stopPropagation()">
            <div class="action-row" style="gap:4px;">
              <button class="btn btn-icon btn-sm btn-outline" title="Edit" onclick="window.EOB.openEditEOB(${e.id})">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="btn btn-icon btn-sm btn-danger" title="Delete" onclick="window.EOB.deleteEOB(${e.id})">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>`;
      }).join('');
    }

    const totalBilled  = filtered.reduce((s, e) => s + (e.billed_amount || 0), 0);
    const totalPaid    = filtered.reduce((s, e) => s + (e.paid_amount || 0), 0);
    const discrepCount = filtered.filter(e => e.discrepancy_flag === 1).length;
    document.getElementById('eobSummary').innerHTML = `
      <span><b style="color:var(--text-primary);">${filtered.length}</b> EOB records</span>
      <span>Total Billed: <b style="color:var(--gold);">${formatCurrency(totalBilled)}</b></span>
      <span>Total Paid: <b style="color:var(--success);">${formatCurrency(totalPaid)}</b></span>
      ${discrepCount > 0 ? `<span style="color:#e74c3c;"><i class="fa-solid fa-triangle-exclamation" style="margin-right:4px;"></i><b>${discrepCount}</b> discrepanc${discrepCount === 1 ? 'y' : 'ies'}</span>` : ''}
    `;
  }

  // ── Receipts Table ──────────────────────────────────────────────────────────
  function renderReceiptsTable() {
    const search = (document.getElementById('receiptSearch')?.value || '').toLowerCase();
    const method = document.getElementById('receiptMethodFilter')?.value || '';

    let filtered = allPayments.filter(p => {
      const name = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase();
      const ref  = (p.reference || '').toLowerCase();
      const matchSearch = !search || name.includes(search) || ref.includes(search);
      const matchMethod = !method || p.method === method;
      return matchSearch && matchMethod;
    });

    filtered = filtered.sort((a, b) => new Date(b.date || b.created_at || 0) - new Date(a.date || a.created_at || 0));

    const tbody = document.getElementById('receiptsTableBody');
    if (!tbody) return;

    const methodIcons = { cash: 'fa-money-bill', card: 'fa-credit-card', check: 'fa-money-check', insurance: 'fa-shield-halved' };

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="table-empty"><i class="fa-solid fa-receipt"></i><p>No payments found</p></div></td></tr>`;
    } else {
      tbody.innerHTML = filtered.map(p => `<tr>
        <td class="td-primary">${formatDate(p.date)}</td>
        <td>${p.first_name || ''} ${p.last_name || ''}</td>
        <td class="text-success" style="font-weight:700;">${formatCurrency(p.amount)}</td>
        <td>
          <span style="display:flex;align-items:center;gap:5px;font-size:12px;text-transform:capitalize;">
            <i class="fa-solid ${methodIcons[p.method] || 'fa-dollar-sign'}" style="color:var(--gold);"></i>
            ${p.method || '—'}
          </span>
        </td>
        <td style="font-size:12px;">${p.reference || '—'}</td>
        <td onclick="event.stopPropagation()">
          <button class="btn btn-sm btn-outline" title="Generate Receipt" onclick="window.EOB.generateReceipt(${p.id})" style="font-size:11px;padding:4px 8px;">
            <i class="fa-solid fa-print"></i> Receipt
          </button>
        </td>
      </tr>`).join('');
    }

    const total = filtered.reduce((s, p) => s + (p.amount || 0), 0);
    document.getElementById('receiptsSummary').innerHTML = `
      <span><b style="color:var(--text-primary);">${filtered.length}</b> payments</span>
      <span>Total: <b style="color:var(--success);">${formatCurrency(total)}</b></span>
    `;
  }

  // ── Open EOB Modal: New ─────────────────────────────────────────────────────
  function openNewEOB() {
    document.getElementById('eobForm').reset();
    document.getElementById('eobClaim').innerHTML = '<option value="">Select claim (optional)...</option>';
    document.getElementById('eobReceivedDate').value = todayString();
    document.getElementById('eobDiscrepancyNoteWrap').style.display = 'none';
    openModal('eobModal');
  }

  // ── Open EOB Modal: Edit ────────────────────────────────────────────────────
  function openEditEOB(id) {
    const eob = allEOBs.find(e => e.id === id);
    if (!eob) return;
    document.getElementById('eobPatient').value          = eob.patient_id || '';
    document.getElementById('eobInsurer').value          = eob.insurer || '';
    document.getElementById('eobReceivedDate').value     = eob.received_date || '';
    document.getElementById('eobBilled').value           = eob.billed_amount || 0;
    document.getElementById('eobAllowed').value          = eob.allowed_amount || 0;
    document.getElementById('eobPaid').value             = eob.paid_amount || 0;
    document.getElementById('eobPatientResp').value      = eob.patient_responsibility || 0;
    document.getElementById('eobAdjustmentReason').value = eob.adjustment_reason || '';
    document.getElementById('eobDiscrepancyNotes').value = eob.discrepancy_notes || '';

    if (eob.patient_id) {
      onEOBPatientChange().then(() => {
        document.getElementById('eobClaim').value = eob.claim_id || '';
      });
    }

    const wrap = document.getElementById('eobDiscrepancyNoteWrap');
    wrap.style.display = eob.discrepancy_flag ? 'block' : 'none';

    // Store editing id on button
    document.getElementById('eobModalSave').dataset.editId = id;
    openModal('eobModal');
  }

  // ── Load claims when patient selected ──────────────────────────────────────
  async function onEOBPatientChange() {
    const patientId = document.getElementById('eobPatient')?.value;
    const sel = document.getElementById('eobClaim');
    sel.innerHTML = '<option value="">Select claim (optional)...</option>';
    if (!patientId) return;
    try {
      const claims = await window.api.claims.getByPatient(parseInt(patientId));
      claims.forEach(c => {
        sel.innerHTML += `<option value="${c.id}">${c.claim_number || 'CLM-'+c.id} — ${formatCurrency(c.amount)}</option>`;
      });
    } catch (_) {}
  }

  // ── Detect discrepancy as amounts are typed ─────────────────────────────────
  function checkDiscrepancy() {
    const billed  = parseFloat(document.getElementById('eobBilled')?.value) || 0;
    const allowed = parseFloat(document.getElementById('eobAllowed')?.value) || 0;
    const paid    = parseFloat(document.getElementById('eobPaid')?.value) || 0;
    const resp    = parseFloat(document.getElementById('eobPatientResp')?.value) || 0;
    const wrap    = document.getElementById('eobDiscrepancyNoteWrap');
    if (!wrap) return;
    // Flag if allowed < billed significantly, or paid + resp doesn't reconcile with allowed
    const hasDiscrep = (allowed > 0 && allowed < billed * 0.9) ||
                       (allowed > 0 && Math.abs((paid + resp) - allowed) > 0.5);
    wrap.style.display = hasDiscrep ? 'block' : 'none';
  }

  // ── Save EOB ────────────────────────────────────────────────────────────────
  async function saveEOB() {
    const patientId = document.getElementById('eobPatient').value;
    const insurer   = document.getElementById('eobInsurer').value.trim();
    const billed    = parseFloat(document.getElementById('eobBilled').value);

    if (!patientId) { toast('Please select a patient', 'warning'); return; }
    if (!insurer)   { toast('Please enter an insurer', 'warning'); return; }
    if (!billed || billed <= 0) { toast('Please enter a billed amount', 'warning'); return; }

    const allowed = parseFloat(document.getElementById('eobAllowed').value) || 0;
    const paid    = parseFloat(document.getElementById('eobPaid').value) || 0;
    const resp    = parseFloat(document.getElementById('eobPatientResp').value) || 0;
    const hasDiscrep = (allowed > 0 && allowed < billed * 0.9) ||
                       (allowed > 0 && Math.abs((paid + resp) - allowed) > 0.5) ? 1 : 0;

    const data = {
      patient_id:            parseInt(patientId),
      claim_id:              document.getElementById('eobClaim').value ? parseInt(document.getElementById('eobClaim').value) : null,
      insurer,
      received_date:         document.getElementById('eobReceivedDate').value || todayString(),
      billed_amount:         billed,
      allowed_amount:        allowed,
      paid_amount:           paid,
      patient_responsibility: resp,
      adjustment_reason:     document.getElementById('eobAdjustmentReason').value.trim() || null,
      discrepancy_flag:      hasDiscrep,
      discrepancy_notes:     document.getElementById('eobDiscrepancyNotes').value.trim() || null
    };

    const btn    = document.getElementById('eobModalSave');
    const editId = btn.dataset.editId ? parseInt(btn.dataset.editId) : null;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
      if (editId) {
        await window.api.eob.update(editId, data);
        toast('EOB record updated', 'success');
      } else {
        await window.api.eob.create(data);
        toast('EOB record saved', 'success');
      }
      delete btn.dataset.editId;
      closeModal('eobModal');
      await loadAll();
    } catch (err) {
      console.error(err);
      toast('Failed to save EOB record', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save EOB';
    }
  }

  // ── Delete EOB ──────────────────────────────────────────────────────────────
  async function deleteEOB(id) {
    const confirmed = await confirm('Delete this EOB record?', 'Delete', 'btn-danger');
    if (!confirmed) return;
    try {
      await window.api.eob.delete(id);
      toast('EOB record deleted', 'success');
      await loadAll();
    } catch (err) {
      toast('Failed to delete EOB record', 'error');
    }
  }

  // ── Record Payment ──────────────────────────────────────────────────────────
  function openRecordPayment() {
    document.getElementById('eobPaymentForm').reset();
    document.getElementById('eobPaymentDate').value = todayString();
    openModal('eobPaymentModal');
  }

  async function savePayment() {
    const patientId = document.getElementById('eobPaymentPatient').value;
    const amount    = parseFloat(document.getElementById('eobPaymentAmount').value);
    const date      = document.getElementById('eobPaymentDate').value;

    if (!patientId) { toast('Please select a patient', 'warning'); return; }
    if (!amount || amount <= 0) { toast('Please enter a valid amount', 'warning'); return; }
    if (!date) { toast('Please enter a payment date', 'warning'); return; }

    const data = {
      patient_id: parseInt(patientId),
      amount,
      method:     document.getElementById('eobPaymentMethod').value,
      reference:  document.getElementById('eobPaymentReference').value.trim() || null,
      date,
      notes:      document.getElementById('eobPaymentNotes').value.trim() || null
    };

    const btn = document.getElementById('eobPaymentModalSave');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
      await window.api.payments.create(data);
      toast('Payment recorded', 'success');
      closeModal('eobPaymentModal');
      await loadAll();
    } catch (err) {
      toast('Failed to record payment', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Record Payment';
    }
  }

  // ── Generate Receipt ────────────────────────────────────────────────────────
  function generateReceipt(paymentId) {
    const payment = allPayments.find(p => p.id === paymentId);
    if (!payment) return;

    const receiptNum = `RCT-${String(paymentId).padStart(6, '0')}`;
    const methodLabel = (payment.method || 'cash').charAt(0).toUpperCase() + (payment.method || 'cash').slice(1);

    const win = window.open('', '_blank', 'width=600,height=750');
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt ${receiptNum}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #222; background: #fff; padding: 40px; max-width: 560px; margin: 0 auto; }
    .receipt-header { text-align: center; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 3px double #c9a227; }
    .clinic-name { font-size: 22px; font-weight: 900; color: #1a1a1a; letter-spacing: 0.5px; }
    .clinic-tagline { font-size: 12px; color: #888; margin-top: 4px; }
    .clinic-address { font-size: 12px; color: #666; margin-top: 6px; line-height: 1.5; }
    .receipt-badge { display: inline-block; margin-top: 12px; padding: 5px 18px; border: 2px solid #c9a227; border-radius: 20px; font-size: 13px; font-weight: 800; color: #c9a227; letter-spacing: 1px; text-transform: uppercase; }
    .receipt-meta { display: flex; justify-content: space-between; margin-bottom: 22px; font-size: 13px; }
    .meta-block .label { font-size: 10px; text-transform: uppercase; color: #999; font-weight: 700; margin-bottom: 2px; }
    .meta-block .value { font-size: 13px; color: #222; font-weight: 600; }
    .divider { border: none; border-top: 1px solid #e0e0e0; margin: 18px 0; }
    .patient-section { background: #fafafa; border: 1px solid #e8e8e8; border-radius: 6px; padding: 14px 16px; margin-bottom: 22px; }
    .patient-name { font-size: 15px; font-weight: 700; }
    .patient-sub  { font-size: 12px; color: #666; margin-top: 3px; }
    .amount-section { text-align: center; padding: 20px; background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%); border-radius: 8px; margin-bottom: 22px; }
    .amount-label { font-size: 11px; text-transform: uppercase; color: #999; letter-spacing: 1px; }
    .amount-value { font-size: 36px; font-weight: 900; color: #c9a227; margin-top: 4px; }
    .amount-method { font-size: 12px; color: #aaa; margin-top: 6px; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dotted #eee; font-size: 13px; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { color: #666; }
    .detail-value { font-weight: 600; color: #222; }
    .thank-you { text-align: center; margin-top: 24px; padding-top: 18px; border-top: 2px double #c9a227; }
    .thank-you-text { font-size: 16px; font-weight: 700; color: #c9a227; }
    .thank-you-sub  { font-size: 12px; color: #888; margin-top: 6px; line-height: 1.6; }
    .footer { margin-top: 20px; font-size: 10px; color: #bbb; text-align: center; }
    @media print { body { padding: 20px; } @page { margin: 0.3in; } }
  </style>
</head>
<body>
  <div class="receipt-header">
    <div class="clinic-name">Walden Bailey Chiropractic</div>
    <div class="clinic-tagline">Expert Chiropractic Care</div>
    <div class="clinic-address">Buffalo, NY 14201 &bull; (716) 555-0100<br>www.waldenbailey.com</div>
    <div class="receipt-badge">Payment Receipt</div>
  </div>

  <div class="receipt-meta">
    <div class="meta-block">
      <div class="label">Receipt #</div>
      <div class="value">${receiptNum}</div>
    </div>
    <div class="meta-block" style="text-align:right;">
      <div class="label">Date</div>
      <div class="value">${formatDate(payment.date)}</div>
    </div>
  </div>

  <div class="patient-section">
    <div class="patient-name">${payment.first_name || ''} ${payment.last_name || ''}</div>
    <div class="patient-sub">Patient &bull; Services rendered at Walden Bailey Chiropractic</div>
  </div>

  <div class="amount-section">
    <div class="amount-label">Amount Paid</div>
    <div class="amount-value">${formatCurrency(payment.amount)}</div>
    <div class="amount-method"><i>${methodLabel} Payment</i></div>
  </div>

  <div style="background:#fafafa;border:1px solid #eee;border-radius:6px;padding:14px 16px;margin-bottom:18px;">
    <div class="detail-row"><span class="detail-label">Payment Date</span><span class="detail-value">${formatDate(payment.date)}</span></div>
    <div class="detail-row"><span class="detail-label">Payment Method</span><span class="detail-value">${methodLabel}</span></div>
    ${payment.reference ? `<div class="detail-row"><span class="detail-label">Reference / Check #</span><span class="detail-value">${payment.reference}</span></div>` : ''}
    ${payment.notes ? `<div class="detail-row"><span class="detail-label">Notes</span><span class="detail-value" style="max-width:260px;text-align:right;">${payment.notes}</span></div>` : ''}
    <div class="detail-row" style="margin-top:6px;padding-top:10px;border-top:2px solid #ddd;border-bottom:none;">
      <span class="detail-label" style="font-weight:700;font-size:14px;">Total Paid</span>
      <span class="detail-value" style="font-size:16px;color:#c9a227;">${formatCurrency(payment.amount)}</span>
    </div>
  </div>

  <div class="thank-you">
    <div class="thank-you-text">Thank You for Your Payment!</div>
    <div class="thank-you-sub">
      We appreciate your trust in Walden Bailey Chiropractic.<br>
      Please retain this receipt for your records.<br>
      Questions? Contact us at (716) 555-0100.
    </div>
  </div>

  <div class="footer">
    This receipt confirms payment received. For insurance or billing inquiries, contact our office. &bull; Printed ${new Date().toLocaleString('en-US')}
  </div>

  <script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`);
    win.document.close();
  }

  // ── Bind Events ─────────────────────────────────────────────────────────────
  function bindEvents() {
    // Tab switching
    document.querySelectorAll('#eobTabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#eobTabs .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('#view-eob .tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`eob-tab-${btn.dataset.tab}`).classList.add('active');
        activeTab = btn.dataset.tab;
      });
    });

    // EOB filters
    document.getElementById('eobSearch')?.addEventListener('input', () => {
      clearTimeout(window._eobSearchTimer);
      window._eobSearchTimer = setTimeout(renderEOBTable, 200);
    });
    document.getElementById('eobDiscrepancyFilter')?.addEventListener('change', renderEOBTable);

    // Receipt filters
    document.getElementById('receiptSearch')?.addEventListener('input', () => {
      clearTimeout(window._receiptSearchTimer);
      window._receiptSearchTimer = setTimeout(renderReceiptsTable, 200);
    });
    document.getElementById('receiptMethodFilter')?.addEventListener('change', renderReceiptsTable);

    // Buttons
    document.getElementById('newEOBBtn')?.addEventListener('click', openNewEOB);
    document.getElementById('recordPaymentEOBBtn')?.addEventListener('click', openRecordPayment);

    // EOB modal: patient change → load claims
    document.getElementById('eobPatient')?.addEventListener('change', onEOBPatientChange);

    // EOB modal: check discrepancy on amount change
    ['eobBilled', 'eobAllowed', 'eobPaid', 'eobPatientResp'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', checkDiscrepancy);
    });

    // Save buttons
    document.getElementById('eobModalSave')?.addEventListener('click', saveEOB);
    document.getElementById('eobPaymentModalSave')?.addEventListener('click', savePayment);

    // Modal close
    setupModalClose('eobModal',        ['eobModalClose', 'eobModalCancel']);
    setupModalClose('eobPaymentModal', ['eobPaymentModalClose', 'eobPaymentModalCancel']);
  }

  return {
    render,
    openEditEOB,
    deleteEOB,
    generateReceipt,
    refresh: loadAll
  };
})();
