'use strict';

// ── Scheduling Module ────────────────────────────────────────────────────────
window.Scheduling = (() => {
  const { toast, confirm, statusBadge, openModal, closeModal } = window.App;

  let currentWeekStart = null;
  let weekAppointments = [];
  let allPatients = [];
  let selectedSlot = null;
  let editingApptId = null;

  // ── Office Hours (24h format) ───────────────────────────────────────────────
  // day: 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
  const officeHours = {
    1: [{ start: '08:00', end: '11:45' }, { start: '14:00', end: '16:00' }], // Mon
    2: [{ start: '13:00', end: '16:00' }],                                    // Tue
    3: [{ start: '08:00', end: '11:45' }, { start: '14:00', end: '16:00' }], // Wed
    4: [{ start: '08:00', end: '11:45' }],                                    // Thu
    5: [{ start: '08:00', end: '11:45' }, { start: '14:00', end: '16:00' }], // Fri
    6: [{ start: '09:00', end: '11:45' }]                                     // Sat
  };

  const APPT_TYPES = ['adjustment', 'initial-exam', 'follow-up', 'massage', 'x-ray', 'consultation', 're-evaluation', 'other'];
  const STATUS_OPTIONS = ['scheduled', 'checked-in', 'in-progress', 'completed', 'cancelled', 'no-show'];

  // ── Week Helpers ───────────────────────────────────────────────────────────
  function getMondayOf(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function fmtDate(d) { return d.toISOString().split('T')[0]; }

  function fmtDisplayDate(d) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function isToday(d) {
    return fmtDate(d) === fmtDate(new Date());
  }

  // ── Time Helpers ───────────────────────────────────────────────────────────
  function timeToMinutes(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  function minutesToTime(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }

  function isWithinOfficeHours(dayIndex, timeStr) {
    const ranges = officeHours[dayIndex];
    if (!ranges) return false;
    const t = timeToMinutes(timeStr);
    return ranges.some(r => t >= timeToMinutes(r.start) && t < timeToMinutes(r.end));
  }

  // Generate all 15-min slots from 07:30 to 16:15 (for display)
  function generateTimeSlots() {
    const slots = [];
    for (let mins = 450; mins < 975; mins += 15) { // 7:30 to 16:15
      slots.push(minutesToTime(mins));
    }
    return slots;
  }

  // ── Build HTML ─────────────────────────────────────────────────────────────
  function buildSchedulerHTML() {
    return `
      <div class="scheduler-container">
        <div class="scheduler-toolbar">
          <button class="btn btn-secondary btn-sm" id="prevWeekBtn">
            <i class="fa-solid fa-chevron-left"></i>
          </button>
          <button class="btn btn-secondary btn-sm" id="todayBtn">Today</button>
          <button class="btn btn-secondary btn-sm" id="nextWeekBtn">
            <i class="fa-solid fa-chevron-right"></i>
          </button>
          <div class="week-label" id="weekLabel"></div>
          <div style="flex:1;"></div>
          <button class="btn btn-primary btn-sm" id="newApptBtn">
            <i class="fa-solid fa-plus"></i> New Appointment
          </button>
        </div>

        <div class="calendar-grid">
          <div class="calendar-header" id="calHeader"></div>
          <div class="calendar-scroll">
            <div class="calendar-body" id="calBody"></div>
          </div>
        </div>
      </div>

      <!-- Appointment Modal -->
      <div class="modal-overlay" id="apptModal">
        <div class="modal modal-md">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-calendar-plus"></i> <span id="apptModalTitle">New Appointment</span></div>
            <button class="modal-close" id="apptModalClose">&times;</button>
          </div>
          <div class="modal-body">
            <form id="apptForm">
              <div class="form-grid form-grid-2">
                <div class="form-group full-width">
                  <label class="form-label">Patient <span class="required">*</span></label>
                  <select class="form-control" id="apptPatient" required>
                    <option value="">Select patient...</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Date <span class="required">*</span></label>
                  <input type="date" class="form-control" id="apptDate" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Time <span class="required">*</span></label>
                  <select class="form-control" id="apptTime" required>
                    <option value="">Select time...</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Duration (minutes)</label>
                  <select class="form-control" id="apptDuration">
                    <option value="15">15 min</option>
                    <option value="30" selected>30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">60 min</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Type</label>
                  <select class="form-control" id="apptType">
                    ${APPT_TYPES.map(t => `<option value="${t}">${t.replace(/-/g,' ').replace(/\b\w/g, l => l.toUpperCase())}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group full-width">
                  <label class="form-label">Notes</label>
                  <textarea class="form-control" id="apptNotes" rows="2"></textarea>
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="apptModalCancel">Cancel</button>
            <button class="btn btn-primary" id="apptModalSave">
              <i class="fa-solid fa-floppy-disk"></i> Save Appointment
            </button>
          </div>
        </div>
      </div>

      <!-- Appointment Detail / Action Modal -->
      <div class="modal-overlay" id="apptDetailModal">
        <div class="modal modal-sm">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-calendar-check"></i> Appointment</div>
            <button class="modal-close" id="apptDetailClose">&times;</button>
          </div>
          <div class="modal-body" id="apptDetailBody"></div>
          <div class="modal-footer">
            <div style="flex:1; display:flex; gap:6px; flex-wrap:wrap;" id="apptDetailActions"></div>
            <button class="btn btn-secondary" id="apptDetailCancel">Close</button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  async function render() {
    const view = document.getElementById('view-scheduling');
    if (!view.querySelector('.scheduler-container')) {
      view.innerHTML = buildSchedulerHTML();
      bindSchedulerEvents();
    }

    if (!currentWeekStart) {
      currentWeekStart = getMondayOf(new Date());
    }

    allPatients = await window.api.patients.getAll();
    populatePatientSelect();
    await loadWeek();
  }

  function populatePatientSelect() {
    const sel = document.getElementById('apptPatient');
    if (!sel) return;
    const sorted = [...allPatients].sort((a,b) => a.last_name.localeCompare(b.last_name));
    sel.innerHTML = '<option value="">Select patient...</option>' +
      sorted.map(p => `<option value="${p.id}">${p.last_name}, ${p.first_name}</option>`).join('');
  }

  async function loadWeek() {
    const startDate = fmtDate(currentWeekStart);
    const endDate   = fmtDate(addDays(currentWeekStart, 5)); // Mon–Sat

    updateWeekLabel();

    try {
      weekAppointments = await window.api.appointments.getByDate(startDate, endDate);
    } catch (err) {
      console.error(err);
      weekAppointments = [];
    }

    renderCalendar();
  }

  function updateWeekLabel() {
    const end = addDays(currentWeekStart, 5);
    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const year = currentWeekStart.getFullYear();
    document.getElementById('weekLabel').textContent = `${fmt(currentWeekStart)} — ${fmt(end)}, ${year}`;
  }

  // ── Render Calendar ────────────────────────────────────────────────────────
  function renderCalendar() {
    renderHeader();
    renderBody();
  }

  function renderHeader() {
    const headerEl = document.getElementById('calHeader');
    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    let html = '<div class="cal-header-time"></div>';
    for (let i = 0; i < 6; i++) {
      const dayDate = addDays(currentWeekStart, i);
      const dateStr = fmtDate(dayDate);
      const dayIndex = dayDate.getDay(); // 1=Mon,2=Tue,...
      const apptCount = weekAppointments.filter(a => a.date === dateStr).length;
      const todayCls = isToday(dayDate) ? 'today' : '';
      const closedCls = !officeHours[dayIndex] ? 'style="opacity:0.4;"' : '';

      html += `
        <div class="cal-header-day ${todayCls}" ${closedCls}>
          <div class="cal-day-name">${DAYS[i]}</div>
          <div class="cal-day-date" ${isToday(dayDate) ? 'style="display:flex;"' : ''}>${dayDate.getDate()}</div>
          <div class="cal-appt-count">${apptCount > 0 ? `${apptCount} appt${apptCount !== 1 ? 's' : ''}` : (officeHours[dayIndex] ? 'Open' : 'Closed')}</div>
        </div>`;
    }
    headerEl.innerHTML = html;
  }

  function renderBody() {
    const bodyEl = document.getElementById('calBody');
    const timeSlots = generateTimeSlots();
    const SLOT_HEIGHT = 48; // px per 15-min slot

    // Build time column
    let timeColHTML = '<div class="cal-time-col">';
    timeSlots.forEach(t => {
      const [h, m] = t.split(':').map(Number);
      const displayTime = m === 0 ? window.App.formatTime(t) : '';
      timeColHTML += `<div class="cal-time-slot">${displayTime}</div>`;
    });
    timeColHTML += '</div>';

    // Build day columns
    let dayColsHTML = '';
    for (let i = 0; i < 6; i++) {
      const dayDate  = addDays(currentWeekStart, i);
      const dateStr  = fmtDate(dayDate);
      const dayIndex = dayDate.getDay();
      const ranges   = officeHours[dayIndex] || [];
      const dayAppts = weekAppointments.filter(a => a.date === dateStr);

      dayColsHTML += `<div class="cal-day-col" data-date="${dateStr}">`;

      timeSlots.forEach((t, slotIdx) => {
        const available = ranges.some(r =>
          timeToMinutes(t) >= timeToMinutes(r.start) &&
          timeToMinutes(t) < timeToMinutes(r.end)
        );
        const cls = available ? 'available' : 'unavailable';
        dayColsHTML += `<div class="cal-slot ${cls}" data-time="${t}" data-date="${dateStr}"></div>`;
      });

      // Overlay appointments
      dayAppts.forEach(appt => {
        const apptMins  = timeToMinutes(appt.time);
        const startIdx  = timeSlots.indexOf(minutesToTime(Math.round(apptMins / 15) * 15));
        const topPx     = startIdx >= 0 ? startIdx * SLOT_HEIGHT : 0;
        const heightPx  = Math.max(SLOT_HEIGHT, (appt.duration / 15) * SLOT_HEIGHT);

        dayColsHTML += `
          <div class="cal-appointment status-${appt.status}"
            style="top:${topPx}px; height:${heightPx - 4}px;"
            data-appt-id="${appt.id}"
            onclick="event.stopPropagation(); window.Scheduling.openApptDetail(${appt.id})">
            <div class="cal-appt-name">${appt.last_name}, ${appt.first_name}</div>
            <div class="cal-appt-type">${window.App.formatTime(appt.time)} · ${appt.type?.replace(/-/g,' ')}</div>
          </div>`;
      });

      dayColsHTML += '</div>';
    }

    bodyEl.innerHTML = timeColHTML + dayColsHTML;

    // Bind slot click events
    bodyEl.querySelectorAll('.cal-slot.available').forEach(slot => {
      slot.addEventListener('click', () => {
        selectedSlot = { date: slot.dataset.date, time: slot.dataset.time };
        openNewApptModal(slot.dataset.date, slot.dataset.time);
      });
    });
  }

  // ── Appointment Modal ──────────────────────────────────────────────────────
  function openNewApptModal(date, time) {
    editingApptId = null;
    document.getElementById('apptModalTitle').textContent = 'New Appointment';
    document.getElementById('apptForm').reset();
    if (date) document.getElementById('apptDate').value = date;
    populateTimeSelect(date ? new Date(date + 'T00:00:00').getDay() : null);
    if (time) document.getElementById('apptTime').value = time;
    openModal('apptModal');
  }

  function populateTimeSelect(dayIndex) {
    const sel = document.getElementById('apptTime');
    sel.innerHTML = '<option value="">Select time...</option>';

    if (dayIndex === null) {
      // All slots
      generateTimeSlots().forEach(t => {
        sel.innerHTML += `<option value="${t}">${window.App.formatTime(t)}</option>`;
      });
      return;
    }

    const ranges = officeHours[dayIndex] || [];
    ranges.forEach(range => {
      let t = timeToMinutes(range.start);
      const end = timeToMinutes(range.end);
      while (t < end) {
        const timeStr = minutesToTime(t);
        sel.innerHTML += `<option value="${timeStr}">${window.App.formatTime(timeStr)}</option>`;
        t += 15;
      }
    });
  }

  // Update time options when date changes
  function onDateChange() {
    const dateInput = document.getElementById('apptDate');
    if (!dateInput.value) return;
    const dayIndex = new Date(dateInput.value + 'T00:00:00').getDay();
    populateTimeSelect(dayIndex);
  }

  async function saveAppointment() {
    const patientId = document.getElementById('apptPatient').value;
    const date      = document.getElementById('apptDate').value;
    const time      = document.getElementById('apptTime').value;

    if (!patientId) { toast('Please select a patient', 'warning'); return; }
    if (!date)      { toast('Please select a date', 'warning'); return; }
    if (!time)      { toast('Please select a time', 'warning'); return; }

    const data = {
      patient_id: parseInt(patientId),
      date,
      time,
      duration:   parseInt(document.getElementById('apptDuration').value) || 30,
      type:       document.getElementById('apptType').value,
      notes:      document.getElementById('apptNotes').value.trim() || null,
      status:     'scheduled',
      provider:   'Dr. Walden Bailey'
    };

    const btn = document.getElementById('apptModalSave');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
      if (editingApptId) {
        await window.api.appointments.update(editingApptId, data);
        toast('Appointment updated', 'success');
      } else {
        await window.api.appointments.create(data);
        toast('Appointment booked', 'success');
      }
      closeModal('apptModal');
      await loadWeek();
      window.App.refreshDashboard();
    } catch (err) {
      console.error(err);
      toast('Failed to save appointment', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Appointment';
    }
  }

  // ── Appointment Detail ─────────────────────────────────────────────────────
  async function openApptDetail(apptId) {
    const appt = weekAppointments.find(a => a.id === apptId);
    if (!appt) return;

    document.getElementById('apptDetailBody').innerHTML = `
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div style="display:flex; align-items:center; gap:10px; padding:12px; background:var(--bg-mid); border-radius:var(--radius);">
          <div class="user-avatar" style="width:40px;height:40px;font-size:14px;">
            ${appt.first_name[0]}${appt.last_name[0]}
          </div>
          <div>
            <div style="font-size:15px;font-weight:700;color:var(--text-primary);">${appt.first_name} ${appt.last_name}</div>
            <div style="font-size:12px;color:var(--text-muted);">${appt.phone || 'No phone'}</div>
          </div>
        </div>
        <div class="info-grid" style="grid-template-columns:1fr 1fr;">
          <div class="info-item"><div class="info-label">Date</div><div class="info-value">${window.App.formatDate(appt.date)}</div></div>
          <div class="info-item"><div class="info-label">Time</div><div class="info-value">${window.App.formatTime(appt.time)}</div></div>
          <div class="info-item"><div class="info-label">Type</div><div class="info-value" style="text-transform:capitalize;">${appt.type?.replace(/-/g,' ')}</div></div>
          <div class="info-item"><div class="info-label">Duration</div><div class="info-value">${appt.duration} min</div></div>
          <div class="info-item"><div class="info-label">Provider</div><div class="info-value">${appt.provider}</div></div>
          <div class="info-item"><div class="info-label">Status</div><div class="info-value">${statusBadge(appt.status)}</div></div>
        </div>
        ${appt.notes ? `<div style="font-size:12px;color:var(--text-muted);background:var(--bg-mid);padding:10px;border-radius:var(--radius-sm);">${appt.notes}</div>` : ''}
      </div>
    `;

    // Build action buttons
    const actionsEl = document.getElementById('apptDetailActions');
    const actions = [];

    if (appt.status === 'scheduled') {
      actions.push({ label: 'Check In', icon: 'fa-person-walking-arrow-right', cls: 'btn-info', status: 'checked-in' });
    }
    if (appt.status === 'checked-in') {
      actions.push({ label: 'Start Visit', icon: 'fa-play', cls: 'btn-warning', status: 'in-progress' });
    }
    if (appt.status === 'in-progress') {
      actions.push({ label: 'Complete', icon: 'fa-check', cls: 'btn-success', status: 'completed' });
    }
    if (!['cancelled', 'no-show', 'completed'].includes(appt.status)) {
      actions.push({ label: 'No Show', icon: 'fa-user-slash', cls: 'btn-secondary', status: 'no-show' });
      actions.push({ label: 'Cancel', icon: 'fa-xmark', cls: 'btn-danger', status: 'cancelled' });
    }
    actions.push({ label: 'Edit', icon: 'fa-pen', cls: 'btn-outline', edit: true });

    actionsEl.innerHTML = actions.map(a => `
      <button class="btn btn-sm ${a.cls}" data-action="${a.edit ? 'edit' : a.status}">
        <i class="fa-solid ${a.icon}"></i> ${a.label}
      </button>
    `).join('');

    actionsEl.querySelectorAll('.btn[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        if (action === 'edit') {
          closeModal('apptDetailModal');
          openEditApptModal(appt);
          return;
        }
        try {
          await window.api.appointments.updateStatus(apptId, action);
          toast(`Appointment marked as ${action.replace(/-/g,' ')}`, 'success');
          closeModal('apptDetailModal');
          await loadWeek();
          window.App.refreshDashboard();
        } catch (err) {
          toast('Failed to update status', 'error');
        }
      });
    });

    openModal('apptDetailModal');
  }

  function openEditApptModal(appt) {
    editingApptId = appt.id;
    document.getElementById('apptModalTitle').textContent = 'Edit Appointment';
    document.getElementById('apptPatient').value = appt.patient_id;
    document.getElementById('apptDate').value = appt.date;
    const dayIndex = new Date(appt.date + 'T00:00:00').getDay();
    populateTimeSelect(dayIndex);
    document.getElementById('apptTime').value = appt.time;
    document.getElementById('apptDuration').value = appt.duration;
    document.getElementById('apptType').value = appt.type;
    document.getElementById('apptNotes').value = appt.notes || '';
    openModal('apptModal');
  }

  // ── Bind Events ───────────────────────────────────────────────────────────
  function bindSchedulerEvents() {
    document.getElementById('prevWeekBtn')?.addEventListener('click', async () => {
      currentWeekStart = addDays(currentWeekStart, -7);
      await loadWeek();
    });

    document.getElementById('nextWeekBtn')?.addEventListener('click', async () => {
      currentWeekStart = addDays(currentWeekStart, 7);
      await loadWeek();
    });

    document.getElementById('todayBtn')?.addEventListener('click', async () => {
      currentWeekStart = getMondayOf(new Date());
      await loadWeek();
    });

    document.getElementById('newApptBtn')?.addEventListener('click', () => {
      openNewApptModal(window.App.todayString(), null);
    });

    document.getElementById('apptDate')?.addEventListener('change', onDateChange);
    document.getElementById('apptModalSave')?.addEventListener('click', saveAppointment);

    window.App.setupModalClose('apptModal',       ['apptModalClose', 'apptModalCancel']);
    window.App.setupModalClose('apptDetailModal', ['apptDetailClose', 'apptDetailCancel']);
  }

  return {
    render,
    openApptDetail,
    refresh: loadWeek
  };
})();
