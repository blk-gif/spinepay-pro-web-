'use strict';

// ── Transport Module ──────────────────────────────────────────────────────────
window.Transport = (() => {
  const { toast, confirm, openModal, closeModal, formatDate, formatTime, getCurrentUser } = window.App;

  let allRides    = [];
  let allPatients = [];
  let editingRideId = null;
  let activeFilter  = 'all';

  const STATUSES = ['requested', 'confirmed', 'en-route', 'completed', 'cancelled'];

  const STATUS_NEXT = {
    'requested':  'confirmed',
    'confirmed':  'en-route',
    'en-route':   'completed'
  };

  const STATUS_LABELS = {
    'requested':  'Requested',
    'confirmed':  'Confirmed',
    'en-route':   'En Route',
    'completed':  'Completed',
    'cancelled':  'Cancelled'
  };

  // ── Transport status badge ─────────────────────────────────────────────────
  function transportBadge(status) {
    return `<span class="transport-status-badge transport-status-${status}">${STATUS_LABELS[status] || status}</span>`;
  }

  // ── Build HTML ─────────────────────────────────────────────────────────────
  function buildHTML() {
    return `
      <div class="section-header mb-16">
        <div class="section-title">Transportation <span>Management</span></div>
        <button class="btn btn-primary" id="bookRideBtn">
          <i class="fa-solid fa-car"></i> Book Ride
        </button>
      </div>

      <!-- Stats row -->
      <div class="stats-row mb-16" id="transportStats">
        <div class="stat-card">
          <div class="stat-icon"><i class="fa-solid fa-calendar-day"></i></div>
          <div class="stat-value" id="transport-stat-today">0</div>
          <div class="stat-label">Today's Pickups</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="color:var(--warning);"><i class="fa-solid fa-clock"></i></div>
          <div class="stat-value" id="transport-stat-pending">0</div>
          <div class="stat-label">Pending</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="color:var(--success);"><i class="fa-solid fa-circle-check"></i></div>
          <div class="stat-value" id="transport-stat-completed">0</div>
          <div class="stat-label">Completed</div>
        </div>
      </div>

      <div class="card card-gold">
        <!-- Filter bar -->
        <div class="filter-bar">
          <div class="filter-chips" id="transportFilterChips">
            <button class="filter-chip active" data-status="all">All</button>
            <button class="filter-chip" data-status="requested">Requested</button>
            <button class="filter-chip" data-status="confirmed">Confirmed</button>
            <button class="filter-chip" data-status="en-route">En Route</button>
            <button class="filter-chip" data-status="completed">Completed</button>
            <button class="filter-chip" data-status="cancelled">Cancelled</button>
          </div>
        </div>

        <div class="table-wrapper">
          <table id="transportTable">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Appt Date / Time</th>
                <th>Pickup Address</th>
                <th>Pickup Time</th>
                <th>Driver</th>
                <th>Status</th>
                <th style="width:140px;">Actions</th>
              </tr>
            </thead>
            <tbody id="transportTableBody">
              <tr><td colspan="7"><div class="table-empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading...</p></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Book / Edit Ride Modal -->
      <div class="modal-overlay" id="rideModal">
        <div class="modal modal-lg">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-car"></i> <span id="rideModalTitle">Book Ride</span></div>
            <button class="modal-close" id="rideModalClose">&times;</button>
          </div>
          <div class="modal-body">
            <form id="rideForm">
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label">Patient <span class="required">*</span></label>
                  <select class="form-control" id="ridePatient" required>
                    <option value="">Select patient...</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Link to Appointment</label>
                  <select class="form-control" id="rideAppointment">
                    <option value="">Select appointment...</option>
                  </select>
                </div>
                <div class="form-group full-width">
                  <label class="form-label">Pickup Address <span class="required">*</span></label>
                  <textarea class="form-control" id="ridePickupAddress" rows="2" required placeholder="Enter full pickup address..."></textarea>
                </div>
                <div class="form-group">
                  <label class="form-label">Pickup Time <span class="required">*</span></label>
                  <input type="time" class="form-control" id="ridePickupTime" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Drop-off Address</label>
                  <input type="text" class="form-control" id="rideDropoffAddress" value="1086 Walden Ave Suite 1, Buffalo, NY 14211" />
                </div>
                <div class="form-group">
                  <label class="form-label">Driver Name</label>
                  <input type="text" class="form-control" id="rideDriverName" placeholder="Driver name..." />
                </div>
                <div class="form-group">
                  <label class="form-label">Status</label>
                  <select class="form-control" id="rideStatus">
                    ${STATUSES.map(s => `<option value="${s}">${STATUS_LABELS[s]}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group full-width">
                  <label class="form-label">Driver Notes</label>
                  <textarea class="form-control" id="rideDriverNotes" rows="2" placeholder="Special instructions, landmarks, etc..."></textarea>
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="rideModalCancel">Cancel</button>
            <button class="btn btn-primary" id="rideModalSave">
              <i class="fa-solid fa-floppy-disk"></i> Save Ride
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  async function render() {
    const view = document.getElementById('view-transport');
    if (!view.querySelector('.section-header')) {
      view.innerHTML = buildHTML();
      bindEvents();
    }
    await loadAll();
  }

  async function loadAll() {
    try {
      [allRides, allPatients] = await Promise.all([
        window.api.transport.getAll(),
        window.api.patients.getAll()
      ]);
      populatePatientSelect();
      updateStats();
      renderTable();
    } catch (err) {
      console.error('Transport loadAll error:', err);
      toast('Failed to load transport data', 'error');
    }
  }

  function populatePatientSelect() {
    const sel = document.getElementById('ridePatient');
    if (!sel) return;
    const sorted = [...allPatients].sort((a, b) => a.last_name.localeCompare(b.last_name));
    sel.innerHTML = '<option value="">Select patient...</option>' +
      sorted.map(p => `<option value="${p.id}">${p.last_name}, ${p.first_name}</option>`).join('');
  }

  function updateStats() {
    const today = window.App.todayString();
    const todayRides     = allRides.filter(r => r.appointment_date === today || r.pickup_date === today);
    const pendingRides   = allRides.filter(r => ['requested', 'confirmed', 'en-route'].includes(r.status));
    const completedRides = allRides.filter(r => r.status === 'completed');

    const statToday     = document.getElementById('transport-stat-today');
    const statPending   = document.getElementById('transport-stat-pending');
    const statCompleted = document.getElementById('transport-stat-completed');
    if (statToday)     statToday.textContent     = todayRides.length;
    if (statPending)   statPending.textContent   = pendingRides.length;
    if (statCompleted) statCompleted.textContent = completedRides.length;
  }

  function renderTable() {
    const filtered = activeFilter === 'all'
      ? allRides
      : allRides.filter(r => r.status === activeFilter);

    const tbody = document.getElementById('transportTableBody');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="table-empty"><i class="fa-solid fa-car"></i><p>No rides found</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(r => {
      const nextStatus = STATUS_NEXT[r.status];
      const advanceBtn = nextStatus
        ? `<button class="btn btn-icon btn-sm btn-success" title="Advance to ${STATUS_LABELS[nextStatus]}"
             onclick="window.Transport.advanceStatus(${r.id}, '${nextStatus}')">
             <i class="fa-solid fa-forward-step"></i>
           </button>`
        : '';

      return `<tr>
        <td class="td-primary">${r.patient_name || '—'}</td>
        <td>
          ${r.appointment_date ? `<div style="font-size:12px;">${formatDate(r.appointment_date)}</div>` : ''}
          ${r.appointment_time ? `<div style="font-size:11px;color:var(--text-muted);">${formatTime(r.appointment_time)}</div>` : '<div style="color:var(--text-muted);font-size:12px;">—</div>'}
        </td>
        <td style="font-size:12px;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.pickup_address || '—'}</td>
        <td style="font-size:13px;">${r.pickup_time ? formatTime(r.pickup_time) : '—'}</td>
        <td style="font-size:12px;">${r.driver_name || '<span style="color:var(--text-muted);">Unassigned</span>'}</td>
        <td>${transportBadge(r.status)}</td>
        <td onclick="event.stopPropagation()">
          <div class="action-row" style="gap:4px;">
            ${advanceBtn}
            <button class="btn btn-icon btn-sm btn-outline" title="Edit" onclick="window.Transport.openEdit(${r.id})">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-icon btn-sm btn-danger" title="Delete" onclick="window.Transport.deleteRide(${r.id})">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // ── Open New / Edit Modal ──────────────────────────────────────────────────
  function openNew() {
    editingRideId = null;
    const titleEl = document.getElementById('rideModalTitle');
    const form    = document.getElementById('rideForm');
    if (titleEl) titleEl.textContent = 'Book Ride';
    if (form)    form.reset();
    // Reset default drop-off
    const dropoff = document.getElementById('rideDropoffAddress');
    if (dropoff) dropoff.value = '1086 Walden Ave Suite 1, Buffalo, NY 14211';
    const apptSel = document.getElementById('rideAppointment');
    if (apptSel) apptSel.innerHTML = '<option value="">Select appointment...</option>';
    openModal('rideModal');
  }

  function openEdit(id) {
    const ride = allRides.find(r => r.id === id);
    if (!ride) return;
    editingRideId = id;
    const titleEl = document.getElementById('rideModalTitle');
    if (titleEl) titleEl.textContent = 'Edit Ride';

    document.getElementById('ridePatient').value         = ride.patient_id || '';
    document.getElementById('ridePickupAddress').value   = ride.pickup_address || '';
    document.getElementById('ridePickupTime').value      = ride.pickup_time || '';
    document.getElementById('rideDropoffAddress').value  = ride.dropoff_address || '1086 Walden Ave Suite 1, Buffalo, NY 14211';
    document.getElementById('rideDriverName').value      = ride.driver_name || '';
    document.getElementById('rideDriverNotes').value     = ride.driver_notes || '';
    document.getElementById('rideStatus').value          = ride.status || 'requested';

    // Load appointments for this patient then set selection
    loadPatientAppointments(ride.patient_id, ride.appointment_id);
    openModal('rideModal');
  }

  async function loadPatientAppointments(patientId, selectedApptId = null) {
    const sel = document.getElementById('rideAppointment');
    if (!sel || !patientId) return;
    sel.innerHTML = '<option value="">Loading...</option>';
    try {
      const appts = await window.api.appointments.getByPatient(parseInt(patientId));
      const upcoming = appts.filter(a => !['cancelled', 'no-show'].includes(a.status));
      sel.innerHTML = '<option value="">Select appointment...</option>' +
        upcoming.map(a =>
          `<option value="${a.id}">${formatDate(a.date)} ${formatTime(a.time)} — ${a.type || 'visit'}</option>`
        ).join('');
      if (selectedApptId) sel.value = selectedApptId;
    } catch (err) {
      sel.innerHTML = '<option value="">Could not load appointments</option>';
    }
  }

  async function saveRide() {
    const patientId     = document.getElementById('ridePatient').value;
    const pickupAddress = document.getElementById('ridePickupAddress').value.trim();
    const pickupTime    = document.getElementById('ridePickupTime').value;

    if (!patientId)     { toast('Please select a patient', 'warning'); return; }
    if (!pickupAddress) { toast('Please enter a pickup address', 'warning'); return; }
    if (!pickupTime)    { toast('Please enter a pickup time', 'warning'); return; }

    const apptId = document.getElementById('rideAppointment').value;

    // Fetch appointment date/time if linked
    let appointmentDate = null;
    let appointmentTime = null;
    if (apptId) {
      try {
        const appts = await window.api.appointments.getByPatient(parseInt(patientId));
        const linked = appts.find(a => a.id === parseInt(apptId));
        if (linked) { appointmentDate = linked.date; appointmentTime = linked.time; }
      } catch (e) {}
    }

    const data = {
      patient_id:       parseInt(patientId),
      appointment_id:   apptId ? parseInt(apptId) : null,
      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
      pickup_address:   pickupAddress,
      pickup_time:      pickupTime,
      dropoff_address:  document.getElementById('rideDropoffAddress').value.trim() || '1086 Walden Ave Suite 1, Buffalo, NY 14211',
      driver_name:      document.getElementById('rideDriverName').value.trim() || null,
      driver_notes:     document.getElementById('rideDriverNotes').value.trim() || null,
      status:           document.getElementById('rideStatus').value
    };

    const btn = document.getElementById('rideModalSave');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
      if (editingRideId) {
        await window.api.transport.update(editingRideId, data);
        toast('Ride updated', 'success');
      } else {
        await window.api.transport.create(data);
        toast('Ride booked', 'success');
      }
      closeModal('rideModal');
      await loadAll();
    } catch (err) {
      console.error(err);
      toast('Failed to save ride', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Ride';
    }
  }

  async function advanceStatus(id, newStatus) {
    try {
      await window.api.transport.update(id, { status: newStatus });
      toast(`Status updated to ${STATUS_LABELS[newStatus]}`, 'success');
      await loadAll();
    } catch (err) {
      toast('Failed to update status', 'error');
    }
  }

  async function deleteRide(id) {
    const confirmed = await confirm('Delete this transport booking?', 'Delete', 'btn-danger');
    if (!confirmed) return;
    try {
      await window.api.transport.delete(id);
      toast('Ride deleted', 'success');
      await loadAll();
    } catch (err) {
      toast('Failed to delete ride', 'error');
    }
  }

  // ── Bind Events ───────────────────────────────────────────────────────────
  function bindEvents() {
    document.getElementById('bookRideBtn')?.addEventListener('click', openNew);
    document.getElementById('rideModalSave')?.addEventListener('click', saveRide);

    // Filter chips
    document.getElementById('transportFilterChips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;
      document.querySelectorAll('#transportFilterChips .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.status;
      renderTable();
    });

    // Patient change → load appointments
    document.getElementById('ridePatient')?.addEventListener('change', (e) => {
      loadPatientAppointments(e.target.value);
    });

    window.App.setupModalClose('rideModal', ['rideModalClose', 'rideModalCancel']);
  }

  return {
    render,
    openEdit,
    advanceStatus,
    deleteRide,
    refresh: loadAll
  };
})();
