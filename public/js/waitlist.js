'use strict';

// ── Waitlist Module ───────────────────────────────────────────────────────────
window.Waitlist = (() => {
  const { toast, confirm, openModal, closeModal, formatDate, formatTime, getCurrentUser } = window.App;

  let allEntries  = [];
  let allPatients = [];
  let showWaitingOnly = false;

  // ── Build HTML ─────────────────────────────────────────────────────────────
  function buildHTML() {
    return `
      <div class="section-header mb-16">
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="section-title">Waitlist <span>Management</span></div>
          <span class="badge" id="waitlistCountBadge" style="background:var(--gold);color:#000;font-size:12px;padding:4px 10px;border-radius:20px;font-weight:700;">0</span>
        </div>
        <button class="btn btn-primary" id="addWaitlistBtn">
          <i class="fa-solid fa-user-plus"></i> Add to Waitlist
        </button>
      </div>

      <div class="card card-gold">
        <!-- Filter bar -->
        <div class="filter-bar">
          <div class="filter-chips" id="waitlistFilterChips">
            <button class="filter-chip active" data-filter="all">Show All</button>
            <button class="filter-chip" data-filter="waiting">Waiting Only</button>
          </div>
        </div>

        <div class="table-wrapper">
          <table id="waitlistTable">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Phone</th>
                <th>Desired Date</th>
                <th>Desired Time</th>
                <th>Notes</th>
                <th>Added</th>
                <th>Status</th>
                <th style="width:180px;">Actions</th>
              </tr>
            </thead>
            <tbody id="waitlistTableBody">
              <tr><td colspan="8"><div class="table-empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading...</p></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Add to Waitlist Modal -->
      <div class="modal-overlay" id="waitlistModal">
        <div class="modal modal-md">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-list-ol"></i> Add to Waitlist</div>
            <button class="modal-close" id="waitlistModalClose">&times;</button>
          </div>
          <div class="modal-body">
            <form id="waitlistForm">
              <div class="form-grid form-grid-2">
                <div class="form-group full-width">
                  <label class="form-label">Patient <span class="required">*</span></label>
                  <select class="form-control" id="waitlistPatient" required>
                    <option value="">Select patient...</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Desired Date</label>
                  <input type="date" class="form-control" id="waitlistDesiredDate" />
                </div>
                <div class="form-group">
                  <label class="form-label">Desired Time</label>
                  <input type="time" class="form-control" id="waitlistDesiredTime" />
                </div>
                <div class="form-group full-width">
                  <label class="form-label">Notes</label>
                  <textarea class="form-control" id="waitlistNotes" rows="3" placeholder="Reason for visit, preferences, urgency..."></textarea>
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="waitlistModalCancel">Cancel</button>
            <button class="btn btn-primary" id="waitlistModalSave">
              <i class="fa-solid fa-floppy-disk"></i> Add to Waitlist
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  async function render() {
    const view = document.getElementById('view-waitlist');
    if (!view.querySelector('.section-header')) {
      view.innerHTML = buildHTML();
      bindEvents();
    }
    await loadAll();
  }

  async function loadAll() {
    try {
      [allEntries, allPatients] = await Promise.all([
        window.api.waitlist.getAll(),
        window.api.patients.getAll()
      ]);
      populatePatientSelect();
      updateCountBadge();
      renderTable();
    } catch (err) {
      console.error('Waitlist loadAll error:', err);
      toast('Failed to load waitlist', 'error');
    }
  }

  function populatePatientSelect() {
    const sel = document.getElementById('waitlistPatient');
    if (!sel) return;
    const sorted = [...allPatients].sort((a, b) => a.last_name.localeCompare(b.last_name));
    sel.innerHTML = '<option value="">Select patient...</option>' +
      sorted.map(p => `<option value="${p.id}">${p.last_name}, ${p.first_name}</option>`).join('');
  }

  function updateCountBadge() {
    const waiting = allEntries.filter(e => e.status === 'waiting').length;
    const badge   = document.getElementById('waitlistCountBadge');
    if (badge) badge.textContent = waiting;
  }

  function renderTable() {
    const filtered = showWaitingOnly
      ? allEntries.filter(e => e.status === 'waiting')
      : allEntries;

    const tbody = document.getElementById('waitlistTableBody');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="8">
          <div class="table-empty" style="padding:48px 20px;">
            <i class="fa-solid fa-list-check" style="font-size:2.5rem;color:var(--gold);opacity:0.4;margin-bottom:12px;"></i>
            <p style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">Waitlist is clear</p>
            <p style="font-size:12px;color:var(--text-muted);">No patients are currently on the waitlist.</p>
          </div>
        </td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(entry => {
      const isPriority = entry.status === 'waiting';
      const rowClass   = isPriority ? 'waitlist-row-priority' : '';

      const statusColors = {
        'waiting':  'var(--gold)',
        'notified': 'var(--info)',
        'booked':   'var(--success)',
        'removed':  'var(--text-muted)'
      };
      const statusColor = statusColors[entry.status] || 'var(--text-muted)';
      const statusLabel = { waiting: 'Waiting', notified: 'Notified', booked: 'Booked', removed: 'Removed' }[entry.status] || entry.status;

      return `<tr class="${rowClass}">
        <td class="td-primary">
          ${isPriority ? '<i class="fa-solid fa-circle" style="color:var(--gold);font-size:8px;margin-right:5px;vertical-align:middle;"></i>' : ''}
          ${entry.patient_name || '—'}
        </td>
        <td style="font-size:12px;">${entry.patient_phone || '—'}</td>
        <td>${entry.desired_date ? formatDate(entry.desired_date) : '<span style="color:var(--text-muted);">Any</span>'}</td>
        <td>${entry.desired_time ? formatTime(entry.desired_time) : '<span style="color:var(--text-muted);">Any</span>'}</td>
        <td style="font-size:12px;color:var(--text-muted);max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${entry.notes || '—'}</td>
        <td style="font-size:12px;color:var(--text-muted);">${formatDate(entry.created_at)}</td>
        <td>
          <span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:${statusColor};">
            <i class="fa-solid fa-circle" style="font-size:7px;"></i> ${statusLabel}
          </span>
        </td>
        <td onclick="event.stopPropagation()">
          <div class="action-row" style="gap:4px;">
            ${entry.status === 'waiting' ? `
              <button class="btn btn-sm btn-outline" title="Mark as Notified" onclick="window.Waitlist.notifyPatient(${entry.id})" style="font-size:11px;">
                <i class="fa-solid fa-bell"></i> Notify
              </button>
            ` : ''}
            <button class="btn btn-sm btn-success" title="Book appointment" onclick="window.Waitlist.bookPatient(${entry.id})" style="font-size:11px;">
              <i class="fa-solid fa-calendar-plus"></i> Book
            </button>
            <button class="btn btn-icon btn-sm btn-danger" title="Remove from waitlist" onclick="window.Waitlist.removeEntry(${entry.id})">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  async function notifyPatient(id) {
    try {
      await window.api.waitlist.updateStatus(id, 'notified');
      toast('Patient notified', 'success');
      await loadAll();
    } catch (err) {
      toast('Failed to update status', 'error');
    }
  }

  function bookPatient(id) {
    const entry = allEntries.find(e => e.id === id);
    if (entry) {
      toast(`Opening scheduling for ${entry.patient_name || 'patient'}...`, 'info');
    }
    window.App.navigateTo('scheduling');
  }

  async function removeEntry(id) {
    const confirmed = await confirm('Remove this patient from the waitlist?', 'Remove', 'btn-danger');
    if (!confirmed) return;
    try {
      await window.api.waitlist.delete(id);
      toast('Removed from waitlist', 'success');
      await loadAll();
    } catch (err) {
      toast('Failed to remove from waitlist', 'error');
    }
  }

  // ── Save New Entry ─────────────────────────────────────────────────────────
  async function saveEntry() {
    const patientId = document.getElementById('waitlistPatient').value;
    if (!patientId) { toast('Please select a patient', 'warning'); return; }

    const data = {
      patient_id:   parseInt(patientId),
      desired_date: document.getElementById('waitlistDesiredDate').value || null,
      desired_time: document.getElementById('waitlistDesiredTime').value || null,
      notes:        document.getElementById('waitlistNotes').value.trim() || null,
      status:       'waiting'
    };

    const btn = document.getElementById('waitlistModalSave');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Adding...';

    try {
      await window.api.waitlist.create(data);
      toast('Patient added to waitlist', 'success');
      closeModal('waitlistModal');
      await loadAll();
    } catch (err) {
      console.error(err);
      toast('Failed to add to waitlist', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Add to Waitlist';
    }
  }

  // ── Bind Events ───────────────────────────────────────────────────────────
  function bindEvents() {
    document.getElementById('addWaitlistBtn')?.addEventListener('click', () => {
      document.getElementById('waitlistForm')?.reset();
      openModal('waitlistModal');
    });

    document.getElementById('waitlistModalSave')?.addEventListener('click', saveEntry);

    document.getElementById('waitlistFilterChips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;
      document.querySelectorAll('#waitlistFilterChips .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      showWaitingOnly = chip.dataset.filter === 'waiting';
      renderTable();
    });

    window.App.setupModalClose('waitlistModal', ['waitlistModalClose', 'waitlistModalCancel']);
  }

  return {
    render,
    notifyPatient,
    bookPatient,
    removeEntry,
    refresh: loadAll
  };
})();
