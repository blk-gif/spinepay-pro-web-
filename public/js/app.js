'use strict';

// ── Global App Controller ────────────────────────────────────────────────────
window.App = (() => {
  let currentModule = 'dashboard';
  let searchDebounceTimer = null;
  let currentUser = null;

  // ── Helpers ────────────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }

  function formatCurrency(amount) {
    return '$' + (parseFloat(amount) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    // Extract just the YYYY-MM-DD part to handle both plain dates and SQLite datetime strings
    const datePart = String(dateStr).split('T')[0].split(' ')[0];
    const d = new Date(datePart + 'T00:00:00');
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatTime(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  function todayString() {
    return new Date().toISOString().split('T')[0];
  }

  // ── Toast System ───────────────────────────────────────────────────────────
  function toast(message, type = 'info', title = null, duration = 3500) {
    const container = $('toastContainer');
    const t = document.createElement('div');
    t.className = `toast ${type}`;

    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
    const defaultTitles = { success: 'Success', error: 'Error', warning: 'Warning', info: 'Info' };

    t.innerHTML = `
      <i class="fa-solid ${icons[type] || icons.info}"></i>
      <div class="toast-text">
        <div class="toast-title">${title || defaultTitles[type]}</div>
        <div>${message}</div>
      </div>
    `;

    container.appendChild(t);

    setTimeout(() => {
      t.classList.add('removing');
      setTimeout(() => t.remove(), 200);
    }, duration);
  }

  // ── Confirm Dialog ─────────────────────────────────────────────────────────
  function confirm(message, btnLabel = 'Delete', btnClass = 'btn-danger') {
    return new Promise((resolve) => {
      const overlay = $('confirmModal');
      $('confirmMessage').textContent = message;
      const okBtn = $('confirmOkBtn');
      okBtn.textContent = btnLabel;
      okBtn.className = `btn ${btnClass}`;
      overlay.classList.add('open');

      function cleanup() {
        overlay.classList.remove('open');
        okBtn.removeEventListener('click', onOk);
        $('confirmCancelBtn').removeEventListener('click', onCancel);
        $('confirmModalClose').removeEventListener('click', onCancel);
      }

      function onOk()    { cleanup(); resolve(true); }
      function onCancel(){ cleanup(); resolve(false); }

      okBtn.addEventListener('click', onOk);
      $('confirmCancelBtn').addEventListener('click', onCancel);
      $('confirmModalClose').addEventListener('click', onCancel);
    });
  }

  // ── Status Badge ───────────────────────────────────────────────────────────
  function statusBadge(status) {
    const labels = {
      'scheduled':   'Scheduled',
      'checked-in':  'Checked In',
      'in-progress': 'In Progress',
      'completed':   'Completed',
      'cancelled':   'Cancelled',
      'no-show':     'No Show',
      'pending':     'Pending',
      'submitted':   'Submitted',
      'in-review':   'In Review',
      'approved':    'Approved',
      'denied':      'Denied',
      'paid':        'Paid',
      'partial':     'Partial',
      'active':      'Active',
      'inactive':    'Inactive',
      'sent':        'Sent',
      'acknowledged':'Acknowledged'
    };
    const label = labels[status] || status;
    return `<span class="badge badge-${status}">${label}</span>`;
  }

  // ── Modal Helpers ──────────────────────────────────────────────────────────
  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
  }

  function setupModalClose(modalId, closeBtnIds = []) {
    const overlay = document.getElementById(modalId);
    if (!overlay) return;

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(modalId);
    });

    // Close buttons
    closeBtnIds.forEach(btnId => {
      const btn = document.getElementById(btnId);
      if (btn) btn.addEventListener('click', () => closeModal(modalId));
    });
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  function navigateTo(module) {
    // Deactivate all nav items
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    // Hide all views
    document.querySelectorAll('.module-view').forEach(el => el.classList.remove('active'));

    // Activate target
    const navEl = document.getElementById(`nav-${module}`);
    const viewEl = document.getElementById(`view-${module}`);

    if (navEl) navEl.classList.add('active');
    if (viewEl) viewEl.classList.add('active');

    currentModule = module;

    // Update topbar title
    const titles = {
      dashboard:  'Dashboard',
      patients:   'Patients',
      scheduling: 'Scheduling',
      soap:       'SOAP Notes',
      intake:     'Intake Forms',
      billing:    'Billing & Claims',
      eob:        'EOB & Receipts',
      reports:    'Reports',
      transport:  'Transportation',
      pi:         'Personal Injury Cases',
      waitlist:   'Waitlist',
      referrals:  'Referrals',
      timeclock:  'Time Clock',
      reminders:  'Reminders'
    };

    $('topbarTitle').innerHTML = `<span>${titles[module] || module}</span>`;

    switch (module) {
      case 'dashboard':   loadDashboard();                  break;
      case 'patients':    window.Patients?.render();        break;
      case 'scheduling':  window.Scheduling?.render();      break;
      case 'soap':        window.SoapNotes?.render();       break;
      case 'intake':      window.IntakeForms?.render();     break;
      case 'billing':     window.Billing?.render();         break;
      case 'eob':         window.EOB?.render();             break;
      case 'reports':     window.Reports?.render();         break;
      case 'transport':   window.Transport?.render();       break;
      case 'pi':          window.PICases?.render();         break;
      case 'waitlist':    window.Waitlist?.render();        break;
      case 'referrals':   window.Referrals?.render();       break;
      case 'timeclock':   window.TimeClock?.render();       break;
      case 'reminders':   window.Reminders?.render();       break;
    }
  }

  // ── Clock ──────────────────────────────────────────────────────────────────
  function startClock() {
    const updateClock = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
      const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      $('clockTime').textContent = timeStr;
      $('clockDate').textContent = dateStr;
    };
    updateClock();
    setInterval(updateClock, 1000);
  }

  // ── Global Search ──────────────────────────────────────────────────────────
  function initGlobalSearch() {
    const input = $('globalSearch');
    const dropdown = $('searchDropdown');

    input.addEventListener('input', () => {
      clearTimeout(searchDebounceTimer);
      const q = input.value.trim();
      if (q.length < 2) {
        dropdown.classList.remove('visible');
        dropdown.innerHTML = '';
        return;
      }
      searchDebounceTimer = setTimeout(() => doSearch(q), 250);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        dropdown.classList.remove('visible');
        input.value = '';
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#topbarSearchWrap')) {
        dropdown.classList.remove('visible');
      }
    });
  }

  async function doSearch(query) {
    const dropdown = $('searchDropdown');
    try {
      const patients = await window.api.patients.search(query);
      if (patients.length === 0) {
        dropdown.innerHTML = '<div class="table-empty" style="padding:20px;"><p>No patients found</p></div>';
        dropdown.classList.add('visible');
        return;
      }
      dropdown.innerHTML = patients.map(p => `
        <div class="search-result-item" data-id="${p.id}">
          <div class="patient-initials">${p.first_name[0]}${p.last_name[0]}</div>
          <div>
            <div class="search-result-name">${p.first_name} ${p.last_name}</div>
            <div class="search-result-sub">${p.phone || 'No phone'} &bull; DOB: ${formatDate(p.dob)}</div>
          </div>
        </div>
      `).join('');
      dropdown.classList.add('visible');

      dropdown.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
          const patientId = parseInt(item.dataset.id);
          dropdown.classList.remove('visible');
          $('globalSearch').value = '';
          navigateTo('patients');
          setTimeout(() => window.Patients?.openPatientDetail(patientId), 300);
        });
      });
    } catch (err) {
      console.error('Search error:', err);
    }
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
  async function loadDashboard() {
    try {
      const today = todayString();
      const isAdmin = currentUser && currentUser.role === 'admin';

      // Load stats in parallel
      const [patients, appointments, claims] = await Promise.all([
        window.api.patients.getAll(),
        window.api.appointments.getByDate(today, today),
        window.api.claims.getAll()
      ]);

      // Total patients
      $('stat-total-patients').textContent = patients.length;

      // Today's appointments
      $('stat-today-appts').textContent = appointments.length;

      // Pending claims count (shown to all, it's just a number)
      const pendingClaims = claims.filter(c => ['pending', 'submitted', 'in-review'].includes(c.status));
      $('stat-pending-claims').textContent = pendingClaims.length;

      if (pendingClaims.length > 0) {
        $('pending-claims-badge').textContent = pendingClaims.length;
        $('pending-claims-badge').style.display = 'inline-flex';
      }

      // ── Revenue stat card: admin only ──
      const revenueCard = $('stat-card-revenue');
      if (isAdmin) {
        const now = new Date();
        const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        const revenue = await window.api.reports.revenueSummary(startOfMonth, endOfMonth);
        $('stat-monthly-revenue').textContent = formatCurrency(revenue.total_collected);
      } else {
        revenueCard.innerHTML = `
          <div class="stat-icon"><i class="fa-solid fa-lock"></i></div>
          <div class="stat-value" style="font-size:11px;line-height:1.4;color:var(--text-muted);margin-top:4px;">Manager<br>Access Required</div>
          <div class="stat-label">Monthly Revenue</div>
        `;
        revenueCard.style.opacity = '0.6';
        revenueCard.style.cursor = 'not-allowed';
      }

      // ── Today's appointments (shown to all) ──
      const apptContainer = $('dashTodayAppts');
      if (appointments.length === 0) {
        apptContainer.innerHTML = `<div class="table-empty"><i class="fa-regular fa-calendar"></i><p>No appointments today</p></div>`;
      } else {
        apptContainer.innerHTML = `<div class="today-appts-list">` +
          appointments.map(a => `
            <div class="appt-list-item" onclick="window.Patients?.openPatientDetail(${a.patient_id})">
              <div class="appt-time">${formatTime(a.time)}</div>
              <div style="flex:1;">
                <div class="appt-patient">${a.first_name} ${a.last_name}</div>
                <div class="appt-type">${a.type.replace(/-/g, ' ')}</div>
              </div>
              ${statusBadge(a.status)}
            </div>
          `).join('') + `</div>`;
      }

      // ── Recent claims panel: admin only ──
      const claimsContainer = $('dashRecentClaims');
      const claimsCard = $('dashRecentClaimsCard');
      if (isAdmin) {
        const recentClaims = claims.slice(0, 5);
        if (recentClaims.length === 0) {
          claimsContainer.innerHTML = `<div class="table-empty"><i class="fa-regular fa-file"></i><p>No recent claims</p></div>`;
        } else {
          claimsContainer.innerHTML = `
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Insurer</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${recentClaims.map(c => `
                    <tr class="clickable" onclick="window.App.navigateTo('billing')">
                      <td class="td-primary">${c.first_name} ${c.last_name}</td>
                      <td>${c.insurer || '—'}</td>
                      <td>${formatCurrency(c.amount)}</td>
                      <td>${statusBadge(c.status)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>`;
        }
      } else {
        claimsContainer.innerHTML = `
          <div class="table-empty" style="padding:30px 20px;">
            <i class="fa-solid fa-lock" style="font-size:2rem;color:var(--gold);opacity:.5;margin-bottom:10px;"></i>
            <p style="font-weight:600;">Manager Access Required</p>
            <p style="font-size:11px;color:var(--text-faint);margin-top:4px;">Billing and revenue data is restricted to admin users.</p>
          </div>`;
      }

      // ── Referral badge (shown to all) ──
      const referrals = await window.api.referrals.getAll();
      const pendingReferrals = referrals.filter(r => r.status === 'pending');
      if (pendingReferrals.length > 0) {
        $('pending-referrals-badge').textContent = pendingReferrals.length;
        $('pending-referrals-badge').style.display = 'inline-flex';
      }

    } catch (err) {
      console.error('Dashboard error:', err);
    }
  }

  // ── Auth Check ─────────────────────────────────────────────────────────────
  function checkAuth() {
    const isAuth = sessionStorage.getItem('isAuthenticated');
    const userData = sessionStorage.getItem('currentUser');
    if (!isAuth || !userData) {
      window.location.href = 'index.html';
      return false;
    }
    currentUser = JSON.parse(userData);
    return true;
  }

  function initUserUI() {
    if (!currentUser) return;
    const initials = currentUser.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const roleLabel = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);

    // Sidebar
    $('sidebarUserAvatar').textContent = initials;
    $('sidebarUserName').textContent = currentUser.full_name;
    $('sidebarUserRole').textContent = roleLabel;

    // Topbar badge
    $('topbarAvatar').textContent = initials;
    $('topbarUserName').textContent = currentUser.full_name;
    $('topbarUserRole').textContent = roleLabel;
    if (currentUser.role === 'admin') {
      $('topbarUserRole').style.color = 'var(--gold)';
    } else {
      $('topbarUserRole').style.color = '#3498db';
    }
  }

  // ── Logout ─────────────────────────────────────────────────────────────────
  async function logout() {
    const confirmed = await confirm('Are you sure you want to sign out?', 'Sign Out', 'btn-secondary');
    if (!confirmed) return;
    try {
      await window.api.auth.logout();
    } catch (e) { /* ignore */ }
    sessionStorage.clear();
    window.location.href = 'index.html';
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    if (!checkAuth()) return;
    initUserUI();

    // Hide admin-only nav items from staff
    if (currentUser.role !== 'admin') {
      document.querySelectorAll('.nav-item.admin-only').forEach(el => el.style.display = 'none');
    }

    startClock();
    initGlobalSearch();

    // Sidebar navigation
    document.querySelectorAll('.nav-item[data-module]').forEach(item => {
      item.addEventListener('click', () => navigateTo(item.dataset.module));
    });

    // Logout
    $('logoutBtn').addEventListener('click', logout);

    // Load dashboard
    loadDashboard();
  }

  document.addEventListener('DOMContentLoaded', init);

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    navigateTo,
    toast,
    confirm,
    statusBadge,
    openModal,
    closeModal,
    setupModalClose,
    formatCurrency,
    formatDate,
    formatTime,
    todayString,
    getCurrentUser: () => currentUser,
    refreshDashboard: loadDashboard
  };
})();
