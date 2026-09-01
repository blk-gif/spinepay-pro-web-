'use strict';

// ── Billing Module ───────────────────────────────────────────────────────────
window.Billing = (() => {
  const { toast, confirm, statusBadge, openModal, closeModal, formatCurrency, formatDate } = window.App;

  let allClaims    = [];
  let allPayments  = [];
  let allPatients  = [];
  let editingClaimId   = null;
  let activeTab    = 'claims';

  // Stripe Elements — initialized lazily on first card modal open
  let stripeInstance  = null;
  let stripeCardElem  = null;

  const INSURERS = [
    'BlueCross Blue Shield', 'Aetna', 'UnitedHealth', 'Cigna',
    'Medicare', 'Medicaid', 'Humana', 'Anthem',
    'Personal Injury', 'Workers Comp', 'Self Pay', 'Other'
  ];

  const CLAIM_STATUSES = ['pending', 'submitted', 'in-review', 'approved', 'denied', 'paid', 'partial'];
  const PAYMENT_METHODS = ['cash', 'card', 'check', 'insurance', 'stripe'];

  // ── Build HTML ─────────────────────────────────────────────────────────────
  function buildBillingHTML() {
    return `
      <div class="card card-gold">
        <div class="tabs" id="billingTabs">
          <button class="tab-btn active" data-tab="claims">
            <i class="fa-solid fa-file-invoice-dollar"></i> Claims
          </button>
          <button class="tab-btn" data-tab="payments">
            <i class="fa-solid fa-money-bill-wave"></i> Payments
          </button>
        </div>

        <!-- CLAIMS TAB -->
        <div class="tab-pane active" id="billing-tab-claims">
          <div class="filter-bar">
            <div class="filter-search">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="text" class="form-control" id="claimSearch" placeholder="Search patient, claim #..." />
            </div>
            <select class="form-control" id="claimInsurerFilter" style="width:180px;">
              <option value="">All Insurers</option>
              ${INSURERS.map(i => `<option>${i}</option>`).join('')}
            </select>
            <select class="form-control" id="claimStatusFilter" style="width:140px;">
              <option value="">All Status</option>
              ${CLAIM_STATUSES.map(s => `<option value="${s}">${s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('')}
            </select>
            <div style="flex:1;"></div>
            <button class="btn btn-primary btn-sm" id="newClaimBtn">
              <i class="fa-solid fa-plus"></i> New Claim
            </button>
          </div>
          <div class="table-wrapper">
            <table id="claimsTable">
              <thead>
                <tr>
                  <th>Claim #</th>
                  <th>Patient</th>
                  <th>Insurer</th>
                  <th>Type</th>
                  <th>Billed</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Service Date</th>
                  <th>Status</th>
                  <th style="width:120px;">Actions</th>
                </tr>
              </thead>
              <tbody id="claimsTableBody">
                <tr><td colspan="10"><div class="table-empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading...</p></div></td></tr>
              </tbody>
            </table>
          </div>
          <div id="claimsSummary" style="display:flex;gap:24px;padding:14px 20px;border-top:1px solid var(--border);background:var(--bg-mid);font-size:12px;color:var(--text-muted);"></div>
        </div>

        <!-- PAYMENTS TAB -->
        <div class="tab-pane" id="billing-tab-payments">
          <div class="filter-bar">
            <div class="filter-search">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="text" class="form-control" id="paymentSearch" placeholder="Search patient, reference..." />
            </div>
            <select class="form-control" id="paymentMethodFilter" style="width:140px;">
              <option value="">All Methods</option>
              ${PAYMENT_METHODS.map(m => `<option value="${m}">${m.charAt(0).toUpperCase()+m.slice(1)}</option>`).join('')}
            </select>
            <div style="flex:1;"></div>
            <button class="btn btn-success btn-sm" id="recordPaymentBtn">
              <i class="fa-solid fa-plus"></i> Record Payment
            </button>
            <button class="btn btn-info btn-sm" id="processCardBtn">
              <i class="fa-brands fa-stripe-s"></i> Process Card
            </button>
          </div>
          <div class="table-wrapper">
            <table id="paymentsTable">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Patient</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Notes</th>
                  <th style="width:90px;">Actions</th>
                </tr>
              </thead>
              <tbody id="paymentsTableBody">
                <tr><td colspan="7"><div class="table-empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading...</p></div></td></tr>
              </tbody>
            </table>
          </div>
          <div id="paymentsSummary" style="display:flex;gap:24px;padding:14px 20px;border-top:1px solid var(--border);background:var(--bg-mid);font-size:12px;color:var(--text-muted);"></div>
        </div>
      </div>

      <!-- New/Edit Claim Modal -->
      <div class="modal-overlay" id="claimModal">
        <div class="modal modal-lg">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-file-invoice-dollar"></i> <span id="claimModalTitle">New Claim</span></div>
            <button class="modal-close" id="claimModalClose">&times;</button>
          </div>
          <div class="modal-body">
            <form id="claimForm">
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label">Patient <span class="required">*</span></label>
                  <select class="form-control" id="claimPatient" required>
                    <option value="">Select patient...</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Insurer <span class="required">*</span></label>
                  <select class="form-control" id="claimInsurer" required>
                    <option value="">Select insurer...</option>
                    ${INSURERS.map(i => `<option value="${i}">${i}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Claim Type</label>
                  <select class="form-control" id="claimType">
                    <option value="insurance">Insurance</option>
                    <option value="pi">Personal Injury</option>
                    <option value="workers_comp">Workers Comp</option>
                    <option value="self_pay">Self Pay</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Claim #</label>
                  <input type="text" class="form-control" id="claimNumber" placeholder="Auto-generated if blank" />
                </div>
                <div class="form-group">
                  <label class="form-label">Billed Amount ($) <span class="required">*</span></label>
                  <input type="number" class="form-control" id="claimAmount" min="0" step="0.01" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Paid Amount ($)</label>
                  <input type="number" class="form-control" id="claimPaidAmount" min="0" step="0.01" value="0" />
                </div>
                <div class="form-group">
                  <label class="form-label">Service Date</label>
                  <input type="date" class="form-control" id="claimServiceDate" />
                </div>
                <div class="form-group">
                  <label class="form-label">Filed Date</label>
                  <input type="date" class="form-control" id="claimFiledDate" />
                </div>
                <div class="form-group">
                  <label class="form-label">Status</label>
                  <select class="form-control" id="claimStatus">
                    ${CLAIM_STATUSES.map(s => `<option value="${s}">${s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">ICD-10 Codes</label>
                  <input type="text" class="form-control" id="claimIcdCodes" placeholder="e.g. M54.5, M99.01" />
                </div>
                <div class="form-group">
                  <label class="form-label">CPT Codes</label>
                  <input type="text" class="form-control" id="claimCptCodes" placeholder="e.g. 98941, 97012" />
                </div>
                <div class="form-group full-width">
                  <label class="form-label">Notes</label>
                  <textarea class="form-control" id="claimNotes" rows="2"></textarea>
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="claimModalCancel">Cancel</button>
            <button class="btn btn-primary" id="claimModalSave">
              <i class="fa-solid fa-floppy-disk"></i> Save Claim
            </button>
          </div>
        </div>
      </div>

      <!-- Record Payment Modal -->
      <div class="modal-overlay" id="paymentModal">
        <div class="modal modal-md">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-money-bill-wave"></i> Record Payment</div>
            <button class="modal-close" id="paymentModalClose">&times;</button>
          </div>
          <div class="modal-body">
            <form id="paymentForm">
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label">Patient <span class="required">*</span></label>
                  <select class="form-control" id="paymentPatient" required>
                    <option value="">Select patient...</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Link to Claim (optional)</label>
                  <select class="form-control" id="paymentClaim">
                    <option value="">No linked claim</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Amount ($) <span class="required">*</span></label>
                  <input type="number" class="form-control" id="paymentAmount" min="0.01" step="0.01" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Payment Method</label>
                  <select class="form-control" id="paymentMethod">
                    ${PAYMENT_METHODS.map(m => `<option value="${m}">${m.charAt(0).toUpperCase()+m.slice(1)}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Date <span class="required">*</span></label>
                  <input type="date" class="form-control" id="paymentDate" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Reference / Check #</label>
                  <input type="text" class="form-control" id="paymentReference" />
                </div>
                <div class="form-group full-width">
                  <label class="form-label">Notes</label>
                  <textarea class="form-control" id="paymentNotes" rows="2"></textarea>
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="paymentModalCancel">Cancel</button>
            <button class="btn btn-success" id="paymentModalSave">
              <i class="fa-solid fa-check"></i> Record Payment
            </button>
          </div>
        </div>
      </div>

      <!-- Stripe Process Card Modal -->
      <div class="modal-overlay" id="stripeModal">
        <div class="modal modal-md">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-brands fa-stripe"></i> Process Card Payment</div>
            <button class="modal-close" id="stripeModalClose">&times;</button>
          </div>
          <div class="modal-body">
            <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(52,152,219,0.1);border:1px solid rgba(52,152,219,0.2);border-radius:var(--radius-sm);margin-bottom:16px;font-size:12px;color:var(--info);">
              <i class="fa-solid fa-circle-info"></i>
              Stripe Test Mode — use card 4242 4242 4242 4242, any future expiry, any 3-digit CVC.
            </div>
            <div class="form-grid form-grid-2">
              <div class="form-group">
                <label class="form-label">Patient</label>
                <select class="form-control" id="stripePatient">
                  <option value="">Select patient...</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Amount ($) <span class="required">*</span></label>
                <input type="number" class="form-control" id="stripeAmount" min="0.50" step="0.01" placeholder="0.00" required />
              </div>
              <div class="form-group full-width">
                <label class="form-label">Link to Claim (optional)</label>
                <select class="form-control" id="stripeClaimLink">
                  <option value="">No linked claim</option>
                </select>
              </div>
            </div>
            <div class="stripe-form mt-12">
              <div class="form-label" style="margin-bottom:8px;">Card Details</div>
              <!-- Stripe Elements mounts here — card data goes directly to Stripe, never to our server -->
              <div id="stripe-card-element" style="padding:12px 14px;background:var(--bg3,#2a2a2a);border:1px solid var(--border,#3a3a3a);border-radius:var(--radius-sm,4px);min-height:44px;"></div>
              <div id="stripe-card-errors" style="color:#fa755a;font-size:12px;margin-top:6px;min-height:18px;"></div>
              <div class="stripe-badges mt-8">
                <span class="stripe-badge">VISA</span>
                <span class="stripe-badge">Mastercard</span>
                <span class="stripe-badge">AMEX</span>
                <span class="stripe-badge">Discover</span>
                <span class="stripe-badge" style="margin-left:auto;color:var(--success);border-color:rgba(46,204,113,0.3);">
                  <i class="fa-solid fa-lock"></i> Encrypted by Stripe
                </span>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="stripeModalCancel">Cancel</button>
            <button class="btn btn-info" id="stripeModalProcess">
              <i class="fa-brands fa-stripe-s"></i> Process Payment
            </button>
          </div>
        </div>
      </div>

      <!-- Invoice Modal -->
      <div class="modal-overlay" id="invoiceModal">
        <div class="modal modal-lg">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-file-invoice"></i> Invoice</div>
            <button class="modal-close" id="invoiceModalClose">&times;</button>
          </div>
          <div class="modal-body" id="invoiceBody"></div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="invoiceModalCancel">Close</button>
            <button class="btn btn-primary" onclick="window.print()">
              <i class="fa-solid fa-print"></i> Print Invoice
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  async function render() {
    const view = document.getElementById('view-billing');
    if (!view.querySelector('.card')) {
      view.innerHTML = buildBillingHTML();
      bindBillingEvents();
    }
    allPatients = await window.api.patients.getAll();
    populatePatientSelects();
    await loadAll();
  }

  async function loadAll() {
    try {
      [allClaims, allPayments] = await Promise.all([
        window.api.claims.getAll(),
        window.api.payments.getAll()
      ]);
      renderClaimsTable();
      renderPaymentsTable();
    } catch (err) {
      console.error(err);
      toast('Failed to load billing data', 'error');
    }
  }

  function populatePatientSelects() {
    const sorted = [...allPatients].sort((a,b) => a.last_name.localeCompare(b.last_name));
    const opts = '<option value="">Select patient...</option>' +
      sorted.map(p => `<option value="${p.id}">${p.last_name}, ${p.first_name}</option>`).join('');
    ['claimPatient', 'paymentPatient', 'stripePatient'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = opts;
    });
  }

  // ── Claims Table ───────────────────────────────────────────────────────────
  function renderClaimsTable() {
    const search  = (document.getElementById('claimSearch')?.value || '').toLowerCase();
    const insurer = document.getElementById('claimInsurerFilter')?.value || '';
    const status  = document.getElementById('claimStatusFilter')?.value || '';

    let filtered = allClaims.filter(c => {
      const name = `${c.first_name} ${c.last_name}`.toLowerCase();
      const claimNum = (c.claim_number || '').toLowerCase();
      const matchSearch = !search || name.includes(search) || claimNum.includes(search);
      const matchInsurer = !insurer || c.insurer === insurer;
      const matchStatus  = !status  || c.status === status;
      return matchSearch && matchInsurer && matchStatus;
    });

    const tbody = document.getElementById('claimsTableBody');
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10"><div class="table-empty"><i class="fa-regular fa-file"></i><p>No claims found</p></div></td></tr>`;
    } else {
      tbody.innerHTML = filtered.map(c => {
        const balance = (c.amount || 0) - (c.paid_amount || 0);
        const claimTypeLabel = {
          insurance: 'Insurance', pi: 'Personal Injury', workers_comp: 'Workers Comp', self_pay: 'Self Pay'
        }[c.claim_type] || c.claim_type;

        return `<tr>
          <td class="td-primary">${c.claim_number || '—'}</td>
          <td>${c.first_name} ${c.last_name}</td>
          <td style="font-size:12px;">${c.insurer || '—'}</td>
          <td style="font-size:11px;">${claimTypeLabel}</td>
          <td>${formatCurrency(c.amount)}</td>
          <td class="text-success">${formatCurrency(c.paid_amount)}</td>
          <td class="${balance > 0 ? 'text-warning' : 'text-success'}">${formatCurrency(balance)}</td>
          <td>${formatDate(c.service_date)}</td>
          <td>${statusBadge(c.status)}</td>
          <td onclick="event.stopPropagation()">
            <div class="action-row" style="gap:4px;">
              <button class="btn btn-icon btn-sm btn-outline" title="Invoice" onclick="window.Billing.showInvoice(${c.id})">
                <i class="fa-solid fa-file-invoice"></i>
              </button>
              <button class="btn btn-icon btn-sm btn-outline" title="Edit" onclick="window.Billing.openEditClaim(${c.id})">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="btn btn-icon btn-sm btn-danger" title="Delete" onclick="window.Billing.deleteClaim(${c.id})">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>`;
      }).join('');
    }

    // Summary row
    const totalBilled = filtered.reduce((s, c) => s + (c.amount || 0), 0);
    const totalPaid   = filtered.reduce((s, c) => s + (c.paid_amount || 0), 0);
    const totalBalance= totalBilled - totalPaid;
    document.getElementById('claimsSummary').innerHTML = `
      <span><b style="color:var(--text-primary);">${filtered.length}</b> claims shown</span>
      <span>Total Billed: <b style="color:var(--gold);">${formatCurrency(totalBilled)}</b></span>
      <span>Total Collected: <b style="color:var(--success);">${formatCurrency(totalPaid)}</b></span>
      <span>Outstanding: <b style="color:var(--warning);">${formatCurrency(totalBalance)}</b></span>
    `;
  }

  // ── Payments Table ─────────────────────────────────────────────────────────
  function renderPaymentsTable() {
    const search = (document.getElementById('paymentSearch')?.value || '').toLowerCase();
    const method = document.getElementById('paymentMethodFilter')?.value || '';

    let filtered = allPayments.filter(p => {
      const name = `${p.first_name} ${p.last_name}`.toLowerCase();
      const ref  = (p.reference || '').toLowerCase();
      const matchSearch = !search || name.includes(search) || ref.includes(search);
      const matchMethod = !method || p.method === method;
      return matchSearch && matchMethod;
    });

    const tbody = document.getElementById('paymentsTableBody');
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="table-empty"><i class="fa-solid fa-money-bill"></i><p>No payments found</p></div></td></tr>`;
    } else {
      tbody.innerHTML = filtered.map(p => {
        const methodIcons = { cash: 'fa-money-bill', card: 'fa-credit-card', check: 'fa-money-check', insurance: 'fa-shield-halved', stripe: 'fa-stripe-s' };
        // Show last4 prominently for Stripe payments; fall back to reference field
        const reference = p.card_last4
          ? `···· ${p.card_last4}`
          : (p.reference || '—');
        const isStripe = p.method === 'stripe' && p.stripe_payment_intent_id;
        return `<tr>
          <td class="td-primary">${formatDate(p.date)}</td>
          <td>${p.first_name || ''} ${p.last_name || ''}</td>
          <td class="text-success" style="font-weight:700;">${formatCurrency(p.amount)}</td>
          <td>
            <span style="display:flex;align-items:center;gap:5px;font-size:12px;text-transform:capitalize;">
              <i class="fa-brands ${methodIcons[p.method] || 'fa-dollar-sign'}" style="color:var(--gold);"></i>
              ${p.method}
            </span>
          </td>
          <td style="font-size:12px;">${reference}</td>
          <td style="font-size:12px;color:var(--text-muted);">${p.notes || '—'}</td>
          <td onclick="event.stopPropagation()">
            ${isStripe
              ? `<button class="btn btn-sm btn-outline" style="font-size:11px;" title="Issue Stripe refund" onclick="window.Billing.refundPayment(${p.id})">
                   <i class="fa-solid fa-rotate-left"></i> Refund
                 </button>`
              : '—'}
          </td>
        </tr>`;
      }).join('');
    }

    const total = filtered.reduce((s, p) => s + (p.amount || 0), 0);
    document.getElementById('paymentsSummary').innerHTML = `
      <span><b style="color:var(--text-primary);">${filtered.length}</b> payments</span>
      <span>Total Received: <b style="color:var(--success);">${formatCurrency(total)}</b></span>
    `;
  }

  // ── Claim CRUD ─────────────────────────────────────────────────────────────
  function openNewClaim() {
    editingClaimId = null;
    document.getElementById('claimModalTitle').textContent = 'New Claim';
    document.getElementById('claimForm').reset();
    document.getElementById('claimServiceDate').value = window.App.todayString();
    document.getElementById('claimFiledDate').value = window.App.todayString();
    openModal('claimModal');
  }

  async function openEditClaim(id) {
    const claim = allClaims.find(c => c.id === id);
    if (!claim) return;
    editingClaimId = id;
    document.getElementById('claimModalTitle').textContent = 'Edit Claim';
    document.getElementById('claimPatient').value  = claim.patient_id;
    document.getElementById('claimInsurer').value  = claim.insurer || '';
    document.getElementById('claimType').value     = claim.claim_type || 'insurance';
    document.getElementById('claimNumber').value   = claim.claim_number || '';
    document.getElementById('claimAmount').value   = claim.amount || 0;
    document.getElementById('claimPaidAmount').value = claim.paid_amount || 0;
    document.getElementById('claimServiceDate').value = claim.service_date || '';
    document.getElementById('claimFiledDate').value   = claim.filed_date || '';
    document.getElementById('claimStatus').value   = claim.status || 'pending';
    document.getElementById('claimIcdCodes').value = claim.icd_codes || '';
    document.getElementById('claimCptCodes').value = claim.cpt_codes || '';
    document.getElementById('claimNotes').value    = claim.notes || '';
    openModal('claimModal');
  }

  async function saveClaim() {
    const patientId = document.getElementById('claimPatient').value;
    const insurer   = document.getElementById('claimInsurer').value;
    const amount    = parseFloat(document.getElementById('claimAmount').value);

    if (!patientId) { toast('Please select a patient', 'warning'); return; }
    if (!insurer)   { toast('Please select an insurer', 'warning'); return; }
    if (!amount || amount <= 0) { toast('Please enter a valid billed amount', 'warning'); return; }

    const data = {
      patient_id:    parseInt(patientId),
      insurer,
      claim_type:    document.getElementById('claimType').value,
      claim_number:  document.getElementById('claimNumber').value.trim() || null,
      amount,
      paid_amount:   parseFloat(document.getElementById('claimPaidAmount').value) || 0,
      service_date:  document.getElementById('claimServiceDate').value || null,
      filed_date:    document.getElementById('claimFiledDate').value || null,
      status:        document.getElementById('claimStatus').value,
      icd_codes:     document.getElementById('claimIcdCodes').value.trim() || null,
      cpt_codes:     document.getElementById('claimCptCodes').value.trim() || null,
      notes:         document.getElementById('claimNotes').value.trim() || null
    };

    const btn = document.getElementById('claimModalSave');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
      if (editingClaimId) {
        await window.api.claims.update(editingClaimId, data);
        toast('Claim updated', 'success');
      } else {
        await window.api.claims.create(data);
        toast('Claim created', 'success');
      }
      closeModal('claimModal');
      await loadAll();
    } catch (err) {
      console.error(err);
      toast('Failed to save claim', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Claim';
    }
  }

  async function deleteClaim(id) {
    const confirmed = await confirm('Delete this claim?', 'Delete', 'btn-danger');
    if (!confirmed) return;
    try {
      await window.api.claims.delete(id);
      toast('Claim deleted', 'success');
      await loadAll();
    } catch (err) {
      toast('Failed to delete claim', 'error');
    }
  }

  // ── Invoice ────────────────────────────────────────────────────────────────
  function showInvoice(claimId) {
    const claim = allClaims.find(c => c.id === claimId);
    if (!claim) return;

    const balance = (claim.amount || 0) - (claim.paid_amount || 0);
    const cptCodes = (claim.cpt_codes || '').split(',').map(c => c.trim()).filter(Boolean);
    const icdCodes = (claim.icd_codes || '').split(',').map(c => c.trim()).filter(Boolean);

    document.getElementById('invoiceBody').innerHTML = `
      <div class="invoice-container">
        <div class="invoice-header">
          <div>
            <div class="invoice-title">INVOICE</div>
            <div class="invoice-number">${claim.claim_number || 'CLM-' + claimId}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:16px;font-weight:800;">Walden Bailey Chiropractic</div>
            <div style="color:#666;font-size:12px;margin-top:4px;">Buffalo, NY<br>
            Tel: (716) 555-0100</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;">
          <div>
            <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#999;margin-bottom:6px;">Bill To</div>
            <div style="font-weight:700;">${claim.first_name} ${claim.last_name}</div>
            <div style="color:#666;font-size:13px;">Patient ID: #${claim.patient_id}</div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#999;margin-bottom:6px;">Invoice Details</div>
            <div style="font-size:13px;color:#666;">Service Date: <b style="color:#000;">${formatDate(claim.service_date)}</b></div>
            <div style="font-size:13px;color:#666;">Filed Date: <b style="color:#000;">${formatDate(claim.filed_date)}</b></div>
            <div style="font-size:13px;color:#666;">Insurer: <b style="color:#000;">${claim.insurer || '—'}</b></div>
          </div>
        </div>
        <table class="invoice-table">
          <thead><tr><th>Description</th><th>CPT Code</th><th>ICD-10</th><th style="text-align:right;">Amount</th></tr></thead>
          <tbody>
            ${cptCodes.length > 0 ? cptCodes.map((cpt, i) => `
              <tr>
                <td>Chiropractic Services</td>
                <td>${cpt}</td>
                <td>${icdCodes[i] || '—'}</td>
                <td style="text-align:right;">${formatCurrency(claim.amount / Math.max(cptCodes.length, 1))}</td>
              </tr>
            `).join('') : `
              <tr>
                <td>Chiropractic Services</td>
                <td>—</td>
                <td>—</td>
                <td style="text-align:right;">${formatCurrency(claim.amount)}</td>
              </tr>
            `}
          </tbody>
        </table>
        <div class="invoice-total">
          <table style="margin-left:auto;border-collapse:collapse;">
            <tr><td style="padding:4px 16px;color:#666;">Subtotal</td><td style="padding:4px 0;font-weight:600;">${formatCurrency(claim.amount)}</td></tr>
            <tr><td style="padding:4px 16px;color:#2ecc71;">Amount Paid</td><td style="padding:4px 0;color:#2ecc71;font-weight:600;">(${formatCurrency(claim.paid_amount)})</td></tr>
            <tr style="border-top:2px solid #333;">
              <td style="padding:8px 16px;font-size:16px;font-weight:800;">BALANCE DUE</td>
              <td style="padding:8px 0;font-size:16px;font-weight:800;color:${balance > 0 ? '#c9a227' : '#2ecc71'};">${formatCurrency(balance)}</td>
            </tr>
          </table>
        </div>
        <div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center;">
          Thank you for choosing Walden Bailey Chiropractic. Questions? Call (716) 555-0100.
        </div>
      </div>
    `;
    openModal('invoiceModal');
  }

  // ── Record Payment ─────────────────────────────────────────────────────────
  function openRecordPayment() {
    document.getElementById('paymentForm').reset();
    document.getElementById('paymentDate').value = window.App.todayString();
    openModal('paymentModal');
  }

  // Update claims dropdown when patient selected
  async function onPaymentPatientChange() {
    const patientId = document.getElementById('paymentPatient').value;
    const sel = document.getElementById('paymentClaim');
    sel.innerHTML = '<option value="">No linked claim</option>';
    if (!patientId) return;
    try {
      const claims = await window.api.claims.getByPatient(parseInt(patientId));
      const unpaid = claims.filter(c => c.status !== 'paid');
      unpaid.forEach(c => {
        sel.innerHTML += `<option value="${c.id}">${c.claim_number || 'CLM-'+c.id} — ${formatCurrency(c.amount - c.paid_amount)} balance</option>`;
      });
    } catch(e) {}
  }

  async function savePayment() {
    const patientId = document.getElementById('paymentPatient').value;
    const amount    = parseFloat(document.getElementById('paymentAmount').value);
    const date      = document.getElementById('paymentDate').value;

    if (!patientId) { toast('Please select a patient', 'warning'); return; }
    if (!amount || amount <= 0) { toast('Please enter a valid amount', 'warning'); return; }
    if (!date) { toast('Please enter a payment date', 'warning'); return; }

    const claimId = document.getElementById('paymentClaim').value;
    const data = {
      patient_id: parseInt(patientId),
      claim_id:   claimId ? parseInt(claimId) : null,
      amount,
      method:     document.getElementById('paymentMethod').value,
      reference:  document.getElementById('paymentReference').value.trim() || null,
      date,
      notes:      document.getElementById('paymentNotes').value.trim() || null
    };

    try {
      await window.api.payments.create(data);
      toast('Payment recorded successfully', 'success');
      closeModal('paymentModal');
      await loadAll();
    } catch (err) {
      toast('Failed to record payment', 'error');
    }
  }

  // ── Stripe Processing ──────────────────────────────────────────────────────

  async function initStripe() {
    if (stripeInstance) return true;
    if (typeof Stripe === 'undefined') {
      toast('Stripe.js failed to load. Check your internet connection.', 'error');
      return false;
    }
    try {
      const resp = await fetch('/api/config/stripe', { credentials: 'include' });
      const { publishable_key } = await resp.json();
      if (!publishable_key) {
        toast('Stripe is not configured on this server. Contact your administrator.', 'error');
        return false;
      }
      stripeInstance = Stripe(publishable_key);
    } catch (err) {
      console.error('[Stripe] Init failed:', err);
      toast('Failed to initialize Stripe', 'error');
      return false;
    }
    return true;
  }

  async function openStripeModal() {
    document.getElementById('stripeAmount').value = '';
    const errDiv = document.getElementById('stripe-card-errors');
    if (errDiv) errDiv.textContent = '';

    // Reset claim link dropdown
    const claimSel = document.getElementById('stripeClaimLink');
    if (claimSel) claimSel.innerHTML = '<option value="">No linked claim</option>';

    openModal('stripeModal');

    const ok = await initStripe();
    if (!ok) { closeModal('stripeModal'); return; }

    if (!stripeCardElem) {
      const elements = stripeInstance.elements();
      stripeCardElem = elements.create('card', {
        style: {
          base: {
            color: '#f0f0f0',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '14px',
            fontSmoothing: 'antialiased',
            '::placeholder': { color: '#777' },
          },
          invalid: { color: '#fa755a', iconColor: '#fa755a' },
        },
      });
      stripeCardElem.mount('#stripe-card-element');
      stripeCardElem.on('change', (event) => {
        const div = document.getElementById('stripe-card-errors');
        if (div) div.textContent = event.error ? event.error.message : '';
      });
    }
  }

  // Update claims dropdown when patient selected in Stripe modal
  async function onStripePatientChange() {
    const patientId = document.getElementById('stripePatient').value;
    const sel = document.getElementById('stripeClaimLink');
    if (!sel) return;
    sel.innerHTML = '<option value="">No linked claim</option>';
    if (!patientId) return;
    try {
      const claims = await window.api.claims.getByPatient(parseInt(patientId));
      const unpaid = claims.filter(c => c.status !== 'paid');
      unpaid.forEach(c => {
        sel.innerHTML += `<option value="${c.id}">${c.claim_number || 'CLM-' + c.id} — ${formatCurrency((c.billed_amount || 0) - (c.paid_amount || 0))} balance</option>`;
      });
    } catch (e) {}
  }

  async function processStripePayment() {
    const patientId = document.getElementById('stripePatient').value;
    const amount    = parseFloat(document.getElementById('stripeAmount').value);

    if (!amount || amount < 0.50) { toast('Please enter a valid amount (minimum $0.50)', 'warning'); return; }
    if (!stripeCardElem) { toast('Please wait for the card form to load', 'warning'); return; }

    const claimId = document.getElementById('stripeClaimLink')?.value || null;

    const btn = document.getElementById('stripeModalProcess');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

    try {
      // Step 1: Our server creates a PaymentIntent and returns the client_secret.
      //         Amount and patient metadata are set here — the server is the authority.
      const intentResp = await fetch('/api/payments/create-intent', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({
          amount_dollars: amount,
          patient_id:     patientId ? parseInt(patientId) : null,
          claim_id:       claimId   ? parseInt(claimId)   : null,
        }),
      });

      if (!intentResp.ok) {
        const err = await intentResp.json().catch(() => ({}));
        toast(err.error || 'Failed to initiate payment', 'error');
        return;
      }

      const { client_secret, payment_intent_id } = await intentResp.json();

      // Step 2: Confirm the card payment with Stripe.
      //         Card data goes directly from the browser to Stripe — our server
      //         never sees the raw card number, expiry, or CVC.
      const { paymentIntent, error } = await stripeInstance.confirmCardPayment(
        client_secret,
        { payment_method: { card: stripeCardElem } }
      );

      if (error) {
        const errDiv = document.getElementById('stripe-card-errors');
        if (errDiv) errDiv.textContent = error.message;
        toast(error.message, 'error');
        return;
      }

      // Step 3: Tell our server the payment succeeded so it can write the DB
      //         record immediately (the webhook is the durable safety net).
      await fetch('/api/payments/confirm', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({
          payment_intent_id: paymentIntent.id,
          patient_id:        patientId ? parseInt(patientId) : null,
          claim_id:          claimId   ? parseInt(claimId)   : null,
        }),
      });

      closeModal('stripeModal');
      toast(`Card payment of ${formatCurrency(amount)} processed successfully`, 'success');
      await loadAll();
    } catch (err) {
      console.error('[Stripe] Payment error:', err);
      toast('Payment processing failed. Please try again.', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-brands fa-stripe-s"></i> Process Payment';
    }
  }

  async function refundPayment(paymentId) {
    const confirmed = await confirm(
      'Issue a full Stripe refund for this payment? This cannot be undone.',
      'Issue Refund',
      'btn-warning'
    );
    if (!confirmed) return;

    try {
      const resp = await fetch(`/api/payments/${paymentId}/refund`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({}),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        toast(err.error || 'Refund failed', 'error');
        return;
      }

      toast('Refund issued successfully', 'success');
      await loadAll();
    } catch (err) {
      toast('Refund failed', 'error');
    }
  }

  // ── Bind Events ───────────────────────────────────────────────────────────
  function bindBillingEvents() {
    // Tab switching
    document.querySelectorAll('#billingTabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#billingTabs .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('#view-billing .tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`billing-tab-${btn.dataset.tab}`).classList.add('active');
        activeTab = btn.dataset.tab;
      });
    });

    // Filter inputs
    document.getElementById('claimSearch')?.addEventListener('input', () => { clearTimeout(window._claimSearchTimer); window._claimSearchTimer = setTimeout(renderClaimsTable, 200); });
    document.getElementById('claimInsurerFilter')?.addEventListener('change', renderClaimsTable);
    document.getElementById('claimStatusFilter')?.addEventListener('change', renderClaimsTable);
    document.getElementById('paymentSearch')?.addEventListener('input', () => { clearTimeout(window._paySearchTimer); window._paySearchTimer = setTimeout(renderPaymentsTable, 200); });
    document.getElementById('paymentMethodFilter')?.addEventListener('change', renderPaymentsTable);

    // Buttons
    document.getElementById('newClaimBtn')?.addEventListener('click', openNewClaim);
    document.getElementById('recordPaymentBtn')?.addEventListener('click', openRecordPayment);
    document.getElementById('processCardBtn')?.addEventListener('click', openStripeModal);

    // Save
    document.getElementById('claimModalSave')?.addEventListener('click', saveClaim);
    document.getElementById('paymentModalSave')?.addEventListener('click', savePayment);
    document.getElementById('stripeModalProcess')?.addEventListener('click', processStripePayment);

    // Patient change → load claims for linked claim dropdowns
    document.getElementById('paymentPatient')?.addEventListener('change', onPaymentPatientChange);
    document.getElementById('stripePatient')?.addEventListener('change', onStripePatientChange);

    // Modal close
    window.App.setupModalClose('claimModal',   ['claimModalClose', 'claimModalCancel']);
    window.App.setupModalClose('paymentModal', ['paymentModalClose', 'paymentModalCancel']);
    window.App.setupModalClose('stripeModal',  ['stripeModalClose', 'stripeModalCancel']);
    window.App.setupModalClose('invoiceModal', ['invoiceModalClose', 'invoiceModalCancel']);
  }

  return {
    render,
    openEditClaim,
    deleteClaim,
    showInvoice,
    refundPayment,
    refresh: loadAll
  };
})();
