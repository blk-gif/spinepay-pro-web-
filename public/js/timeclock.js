'use strict';

// ── Time Clock Module ─────────────────────────────────────────────────────────
window.TimeClock = (() => {
  const { toast, confirm, openModal, closeModal, formatDate, getCurrentUser } = window.App;

  let clockStatus        = null;   // { clocked_in: bool, entry: {...} }
  let allEntries         = [];
  let allUsers           = [];
  let currentWeekStart   = null;
  let clockTickInterval  = null;
  let editingEntryId     = null;

  // ── Week helpers ──────────────────────────────────────────────────────────
  function getMondayOf(date) {
    const d   = new Date(date);
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

  function weekLabel(start) {
    const end = addDays(start, 6);
    const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${fmt(start)} — ${fmt(end)}, ${start.getFullYear()}`;
  }

  // ── Duration calculation ──────────────────────────────────────────────────
  function calcDuration(clockIn, clockOut) {
    if (!clockIn) return '—';
    const start = new Date(clockIn);
    const end   = clockOut ? new Date(clockOut) : new Date();
    const ms    = end - start;
    if (ms < 0) return '—';
    const totalMins = Math.floor(ms / 60000);
    const hrs  = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return `${hrs}h ${String(mins).padStart(2, '0')}m`;
  }

  function calcDecimalHours(clockIn, clockOut) {
    if (!clockIn || !clockOut) return 0;
    const ms = new Date(clockOut) - new Date(clockIn);
    return ms > 0 ? ms / 3600000 : 0;
  }

  function fmtDatetime(dtStr) {
    if (!dtStr) return '—';
    const d = new Date(dtStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  // ── Build HTML ─────────────────────────────────────────────────────────────
  function buildHTML() {
    return `
      <!-- Hero Card: My Time Clock -->
      <div class="timeclock-hero mb-16">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
          <div class="user-avatar" style="width:52px;height:52px;font-size:18px;" id="tcHeroAvatar">—</div>
          <div>
            <div style="font-size:16px;font-weight:700;color:var(--text-primary);" id="tcHeroName">—</div>
            <div class="timeclock-status" id="tcHeroStatus">
              <i class="fa-solid fa-circle" style="font-size:8px;"></i>
              <span id="tcHeroStatusLabel">Checking status...</span>
            </div>
          </div>
          <div style="margin-left:auto;text-align:right;">
            <div class="timeclock-time-display" id="tcTimerDisplay">00:00:00</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;" id="tcTimerLabel">Duration</div>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <div class="form-group" style="flex:1;min-width:200px;margin:0;">
            <input type="text" class="form-control" id="tcClockInNotes" placeholder="Clock-in notes (optional)..." />
          </div>
          <button class="btn btn-success" id="tcClockInBtn" style="display:none;">
            <i class="fa-solid fa-play"></i> Clock In
          </button>
          <button class="btn btn-danger" id="tcClockOutBtn" style="display:none;">
            <i class="fa-solid fa-stop"></i> Clock Out
          </button>
        </div>
      </div>

      <!-- Timesheet Section -->
      <div class="section-header mb-12" style="margin-top:8px;">
        <div class="section-title" style="font-size:16px;">Timesheet</div>
        <div class="action-row">
          <button class="btn btn-secondary btn-sm" id="tcPrevWeek"><i class="fa-solid fa-chevron-left"></i></button>
          <button class="btn btn-secondary btn-sm" id="tcThisWeek">This Week</button>
          <button class="btn btn-secondary btn-sm" id="tcNextWeek"><i class="fa-solid fa-chevron-right"></i></button>
          <span class="text-muted" id="tcWeekLabel" style="font-size:13px;font-weight:600;"></span>
        </div>
      </div>

      <div class="card card-gold">
        <div class="table-wrapper">
          <table id="timesheetTable">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Clock In</th>
                <th>Clock Out</th>
                <th>Duration</th>
                <th>Notes</th>
                <th>Approved</th>
                <th style="width:120px;">Actions</th>
              </tr>
            </thead>
            <tbody id="timesheetTableBody">
              <tr><td colspan="7"><div class="table-empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading...</p></div></td></tr>
            </tbody>
            <tfoot id="timesheetTfoot" style="display:none;">
              <tr style="background:var(--bg-mid);font-weight:700;">
                <td colspan="3" style="padding:10px 16px;font-size:12px;color:var(--text-muted);text-align:right;">Weekly Total:</td>
                <td style="padding:10px 16px;">
                  <span class="hours-badge" id="tcWeeklyTotal">0h 00m</span>
                </td>
                <td colspan="3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- Edit Time Entry Modal (admin) -->
      <div class="modal-overlay" id="tcEditModal">
        <div class="modal modal-md">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-pen-to-square"></i> Edit Time Entry</div>
            <button class="modal-close" id="tcEditModalClose">&times;</button>
          </div>
          <div class="modal-body">
            <form id="tcEditForm">
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label">Clock In <span class="required">*</span></label>
                  <input type="datetime-local" class="form-control" id="tcEditClockIn" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Clock Out</label>
                  <input type="datetime-local" class="form-control" id="tcEditClockOut" />
                </div>
                <div class="form-group full-width">
                  <label class="form-label">Notes</label>
                  <textarea class="form-control" id="tcEditNotes" rows="2"></textarea>
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="tcEditModalCancel">Cancel</button>
            <button class="btn btn-primary" id="tcEditModalSave">
              <i class="fa-solid fa-floppy-disk"></i> Save Changes
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  async function render() {
    const view = document.getElementById('view-timeclock');
    if (!view.querySelector('.timeclock-hero')) {
      view.innerHTML = buildHTML();
      bindEvents();
    }

    currentWeekStart = getMondayOf(new Date());
    updateWeekLabel();
    await loadAll();
  }

  async function loadAll() {
    const user    = getCurrentUser();
    const isAdmin = user?.role === 'admin';

    // Update hero user info
    const heroAvatar = document.getElementById('tcHeroAvatar');
    const heroName   = document.getElementById('tcHeroName');
    if (user && heroAvatar && heroName) {
      const initials = user.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      heroAvatar.textContent = initials;
      heroName.textContent   = user.full_name;
    }

    try {
      // Load clock status and entries in parallel; admin also loads all users
      const promises = [
        window.api.timeclock.getStatus(user.id),
        loadWeekEntries()
      ];
      if (isAdmin) promises.push(window.api.timeclock.getAllUsers().then(u => { allUsers = u || []; }));

      const [status] = await Promise.all(promises);
      clockStatus = status;
      updateHeroUI();
    } catch (err) {
      console.error('TimeClock loadAll error:', err);
      toast('Failed to load time clock data', 'error');
    }
  }

  async function loadWeekEntries() {
    const user    = getCurrentUser();
    const isAdmin = user?.role === 'admin';

    const startStr = fmtDate(currentWeekStart);
    const endStr   = fmtDate(addDays(currentWeekStart, 6));

    try {
      const userId = isAdmin ? null : user.id;
      allEntries = await window.api.timeclock.getEntries(userId, startStr, endStr);
    } catch (err) {
      allEntries = [];
    }
    renderTimesheet();
  }

  // ── Hero UI ────────────────────────────────────────────────────────────────
  function updateHeroUI() {
    const isClockedIn  = !!clockStatus;
    const statusEl     = document.getElementById('tcHeroStatus');
    const statusLabel  = document.getElementById('tcHeroStatusLabel');
    const clockInBtn   = document.getElementById('tcClockInBtn');
    const clockOutBtn  = document.getElementById('tcClockOutBtn');
    const notesInput   = document.getElementById('tcClockInNotes');

    if (!statusEl) return;

    if (isClockedIn) {
      statusEl.style.color  = 'var(--success)';
      if (statusLabel) statusLabel.textContent = 'Clocked In';
      if (clockInBtn)  clockInBtn.style.display  = 'none';
      if (clockOutBtn) clockOutBtn.style.display = '';
      if (notesInput)  notesInput.style.display  = 'none';
      startLiveTimer(clockStatus?.clock_in);
    } else {
      statusEl.style.color  = 'var(--text-muted)';
      if (statusLabel) statusLabel.textContent = 'Clocked Out';
      if (clockInBtn)  clockInBtn.style.display  = '';
      if (clockOutBtn) clockOutBtn.style.display = 'none';
      if (notesInput)  notesInput.style.display  = '';
      stopLiveTimer();
      const timerEl = document.getElementById('tcTimerDisplay');
      if (timerEl) timerEl.textContent = '00:00:00';
      const labelEl = document.getElementById('tcTimerLabel');
      if (labelEl) labelEl.textContent = 'Duration';
    }
  }

  function startLiveTimer(clockInStr) {
    stopLiveTimer();
    const startTime = clockInStr ? new Date(clockInStr) : new Date();

    function tick() {
      const ms       = new Date() - startTime;
      const totalSec = Math.floor(ms / 1000);
      const hrs      = Math.floor(totalSec / 3600);
      const mins     = Math.floor((totalSec % 3600) / 60);
      const secs     = totalSec % 60;
      const display  = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      const timerEl = document.getElementById('tcTimerDisplay');
      const labelEl = document.getElementById('tcTimerLabel');
      if (timerEl) timerEl.textContent = display;
      if (labelEl) labelEl.textContent = 'Time Clocked In';
    }

    tick();
    clockTickInterval = setInterval(tick, 1000);
  }

  function stopLiveTimer() {
    if (clockTickInterval) {
      clearInterval(clockTickInterval);
      clockTickInterval = null;
    }
  }

  // ── Clock In / Out ─────────────────────────────────────────────────────────
  async function clockIn() {
    const user  = getCurrentUser();
    const notes = (document.getElementById('tcClockInNotes')?.value || '').trim();

    const btn = document.getElementById('tcClockInBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Clocking In...'; }

    try {
      await window.api.timeclock.clockIn(user.id, notes || null);
      toast('Clocked in successfully', 'success');
      await loadAll();
    } catch (err) {
      console.error(err);
      toast('Failed to clock in', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-play"></i> Clock In'; }
    }
  }

  async function clockOut() {
    const user = getCurrentUser();
    const ok   = await confirm('Clock out now?', 'Clock Out', 'btn-danger');
    if (!ok) return;

    const btn = document.getElementById('tcClockOutBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Clocking Out...'; }

    try {
      await window.api.timeclock.clockOut(user.id);
      toast('Clocked out successfully', 'success');
      await loadAll();
    } catch (err) {
      console.error(err);
      toast('Failed to clock out', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-stop"></i> Clock Out'; }
    }
  }

  // ── Timesheet Table ────────────────────────────────────────────────────────
  function renderTimesheet() {
    const isAdmin = getCurrentUser()?.role === 'admin';
    const tbody   = document.getElementById('timesheetTableBody');
    const tfoot   = document.getElementById('timesheetTfoot');
    if (!tbody) return;

    if (allEntries.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="table-empty"><i class="fa-regular fa-clock"></i><p>No time entries for this week</p></div></td></tr>`;
      if (tfoot) tfoot.style.display = 'none';
      return;
    }

    let totalMs = 0;

    tbody.innerHTML = allEntries.map(entry => {
      const isActive     = !entry.clock_out;
      const duration     = isActive ? '<span style="color:var(--success);font-weight:600;">Active</span>' : calcDuration(entry.clock_in, entry.clock_out);
      const rowClass     = entry.approved ? 'timesheet-row approved' : 'timesheet-row unapproved';
      const approvedBadge = entry.approved
        ? `<span class="badge" style="background:rgba(46,204,113,0.15);color:var(--success);border:1px solid rgba(46,204,113,0.3);"><i class="fa-solid fa-check"></i> Approved</span>`
        : `<span class="badge" style="background:rgba(212,175,55,0.1);color:var(--gold);border:1px solid rgba(212,175,55,0.2);">Pending</span>`;

      if (entry.clock_in && entry.clock_out) {
        totalMs += new Date(entry.clock_out) - new Date(entry.clock_in);
      }

      // Find employee name
      const userName = entry.user_name || entry.full_name ||
        allUsers.find(u => u.id === entry.user_id)?.full_name || `User #${entry.user_id}`;

      const totalHrs     = calcDecimalHours(entry.clock_in, entry.clock_out);
      const hoursDisplay = entry.clock_out
        ? `<span class="hours-badge">${totalHrs.toFixed(2)}h</span>`
        : '<span class="hours-badge" style="background:rgba(46,204,113,0.1);color:var(--success);">Active</span>';

      return `<tr class="${rowClass}">
        <td>
          <div style="display:flex;align-items:center;gap:7px;">
            <div class="user-avatar" style="width:28px;height:28px;font-size:10px;">
              ${userName.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase()}
            </div>
            <span style="font-size:13px;font-weight:600;">${userName}</span>
          </div>
        </td>
        <td style="font-size:12px;">${fmtDatetime(entry.clock_in)}</td>
        <td style="font-size:12px;">${entry.clock_out ? fmtDatetime(entry.clock_out) : '<span style="color:var(--success);font-size:12px;font-weight:600;">Still clocked in</span>'}</td>
        <td>${hoursDisplay}</td>
        <td style="font-size:12px;color:var(--text-muted);">${entry.notes || '—'}</td>
        <td>${approvedBadge}</td>
        <td onclick="event.stopPropagation()">
          <div class="action-row" style="gap:4px;">
            ${isAdmin && !entry.approved ? `
              <button class="btn btn-icon btn-sm btn-success" title="Approve" onclick="window.TimeClock.approveEntry(${entry.id})">
                <i class="fa-solid fa-check"></i>
              </button>
            ` : ''}
            ${isAdmin ? `
              <button class="btn btn-icon btn-sm btn-outline" title="Edit" onclick="window.TimeClock.openEditEntry(${entry.id})">
                <i class="fa-solid fa-pen"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');

    // Weekly total row
    const totalMins = Math.floor(totalMs / 60000);
    const wkHrs     = Math.floor(totalMins / 60);
    const wkMins    = totalMins % 60;
    const totalEl   = document.getElementById('tcWeeklyTotal');
    if (totalEl) totalEl.textContent = `${wkHrs}h ${String(wkMins).padStart(2, '0')}m`;
    if (tfoot) tfoot.style.display = '';
  }

  // ── Approve Entry ──────────────────────────────────────────────────────────
  async function approveEntry(id) {
    try {
      const user = getCurrentUser();
      await window.api.timeclock.approve(id, user.id);
      toast('Entry approved', 'success');
      await loadWeekEntries();
    } catch (err) {
      toast('Failed to approve entry', 'error');
    }
  }

  // ── Edit Entry (admin) ─────────────────────────────────────────────────────
  function openEditEntry(id) {
    const entry = allEntries.find(e => e.id === id);
    if (!entry) return;
    editingEntryId = id;

    // Format datetime for input (datetime-local needs YYYY-MM-DDTHH:MM)
    function toDatetimeLocal(dtStr) {
      if (!dtStr) return '';
      const d = new Date(dtStr);
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    document.getElementById('tcEditClockIn').value  = toDatetimeLocal(entry.clock_in);
    document.getElementById('tcEditClockOut').value = toDatetimeLocal(entry.clock_out);
    document.getElementById('tcEditNotes').value    = entry.notes || '';
    openModal('tcEditModal');
  }

  async function saveEditEntry() {
    if (!editingEntryId) return;
    const clockIn  = document.getElementById('tcEditClockIn').value;
    const clockOut = document.getElementById('tcEditClockOut').value;
    const notes    = document.getElementById('tcEditNotes').value.trim();

    if (!clockIn) { toast('Clock-in time is required', 'warning'); return; }

    const btn = document.getElementById('tcEditModalSave');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
      await window.api.timeclock.update(editingEntryId, {
        clock_in:  clockIn ? new Date(clockIn).toISOString() : null,
        clock_out: clockOut ? new Date(clockOut).toISOString() : null,
        notes:     notes || null
      });
      toast('Time entry updated', 'success');
      closeModal('tcEditModal');
      await loadWeekEntries();
    } catch (err) {
      console.error(err);
      toast('Failed to update time entry', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes';
    }
  }

  // ── Week Navigation ────────────────────────────────────────────────────────
  function updateWeekLabel() {
    const el = document.getElementById('tcWeekLabel');
    if (el) el.textContent = weekLabel(currentWeekStart);
  }

  // ── Bind Events ───────────────────────────────────────────────────────────
  function bindEvents() {
    document.getElementById('tcClockInBtn')?.addEventListener('click', clockIn);
    document.getElementById('tcClockOutBtn')?.addEventListener('click', clockOut);

    document.getElementById('tcPrevWeek')?.addEventListener('click', async () => {
      currentWeekStart = addDays(currentWeekStart, -7);
      updateWeekLabel();
      await loadWeekEntries();
    });

    document.getElementById('tcNextWeek')?.addEventListener('click', async () => {
      currentWeekStart = addDays(currentWeekStart, 7);
      updateWeekLabel();
      await loadWeekEntries();
    });

    document.getElementById('tcThisWeek')?.addEventListener('click', async () => {
      currentWeekStart = getMondayOf(new Date());
      updateWeekLabel();
      await loadWeekEntries();
    });

    document.getElementById('tcEditModalSave')?.addEventListener('click', saveEditEntry);
    window.App.setupModalClose('tcEditModal', ['tcEditModalClose', 'tcEditModalCancel']);
  }

  return {
    render,
    approveEntry,
    openEditEntry,
    refresh: loadAll
  };
})();
