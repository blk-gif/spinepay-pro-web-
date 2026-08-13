'use strict';

// ── SpinePay Pro — Shared Layout for Standalone Pages ─────────────────────
// Provides: full sidebar + topbar rendering, auth guard, clock, user info,
// and all utility globals used by every page in public/pages/

(function () {

  // ── Nav definition ────────────────────────────────────────────────────
  const NAV = [
    { section: 'MAIN' },
    { label: 'Dashboard',        href: '/dashboard',         icon: '📊', adminOnly: false },
    { label: 'Patients',         href: '/patients',          icon: '👥', adminOnly: false },
    { label: 'Documents',        href: '/documents',         icon: '📁', adminOnly: false },
    { label: 'Doc Admin',        href: '/document-admin',    icon: '📋', adminOnly: true  },
    { label: 'Scheduling',       href: '/scheduling',        icon: '📅', adminOnly: false },
    { section: 'CLINICAL' },
    { label: 'SOAP Notes',       href: '/soap-notes',        icon: '📋', adminOnly: false },
    { label: 'Intake Forms',     href: '/intake-forms',      icon: '📝', adminOnly: false },
    { section: 'BILLING' },
    { label: 'Billing & Claims', href: '/billing',           icon: '💵', adminOnly: true  },
    { label: 'EOB & Receipts',   href: '/eob-records',       icon: '🧾', adminOnly: true  },
    { label: 'Revenue',          href: '/revenue',           icon: '📈', adminOnly: true  },
    { section: 'OPERATIONS' },
    { label: 'Transportation',   href: '/transportation',    icon: '🚗', adminOnly: false },
    { label: 'PI Cases',         href: '/pi-cases',          icon: '⚖️', adminOnly: false },
    { label: 'Waitlist',         href: '/waitlist',          icon: '📋', adminOnly: false },
    { section: 'NETWORK' },
    { label: 'Referrals',        href: '/referrals',         icon: '🔗', adminOnly: false },
    { section: 'STAFF' },
    { label: 'Time Clock',       href: '/time-clock',        icon: '⏰', adminOnly: false },
    { label: 'Reminders',        href: '/reminders',         icon: '🔔', adminOnly: false },
    { section: 'SYSTEM' },
    { label: 'Staff',            href: '/staff',             icon: '👤', adminOnly: true  },
    { label: 'Time Approvals',   href: '/timeclock-admin',   icon: '✅', adminOnly: true  },
    { label: 'Activity Log',     href: '/activity-log',      icon: '📋', adminOnly: true  },
    { label: 'Settings',         href: '/settings',          icon: '⚙️', adminOnly: true  },
  ];

  // ── Detect active page ────────────────────────────────────────────────
  function getCurrentPage() {
    return window.location.pathname
      .replace(/^\/pages\//, '/')
      .replace(/\.html$/, '')
      .replace(/^\//, '') || 'dashboard';
  }

  // ── Utility globals ───────────────────────────────────────────────────

  window.escHtml = function escHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  window.fmtMoney = function fmtMoney(n) {
    const v = parseFloat(n) || 0;
    return '$' + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  window.fmtDate = function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  window.statusBadge = function statusBadge(status) {
    const map = {
      scheduled: 'Scheduled', 'checked-in': 'Checked In', 'in-progress': 'In Progress',
      completed: 'Completed', cancelled: 'Cancelled', 'no-show': 'No Show',
      pending: 'Pending', submitted: 'Submitted', approved: 'Approved',
      denied: 'Denied', paid: 'Paid', partial: 'Partial',
      active: 'Active', inactive: 'Inactive', sent: 'Sent', waiting: 'Waiting',
      open: 'Open', closed: 'Closed', received: 'Received',
    };
    return `<span class="badge badge-${status}">${map[status] || status}</span>`;
  };

  window.openModal = function openModal(id) {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('hidden'); el.classList.add('open'); }
  };

  window.closeModal = function closeModal(id) {
    const el = document.getElementById(id);
    if (el) { el.classList.add('hidden'); el.classList.remove('open'); }
  };

  window.showAlert = function showAlert(msg, type) {
    const el = document.getElementById('alert-area');
    if (!el) return;
    type = type || 'success';
    const styles = {
      success: { bg: 'rgba(46,204,113,.15)',  border: 'rgba(46,204,113,.4)',  color: '#2ecc71' },
      error:   { bg: 'rgba(231,76,60,.15)',   border: 'rgba(231,76,60,.4)',   color: '#e74c3c' },
      warning: { bg: 'rgba(243,156,18,.15)',  border: 'rgba(243,156,18,.4)',  color: '#f39c12' },
    };
    const s = styles[type] || styles.success;
    el.innerHTML = `<div style="padding:10px 14px;border-radius:6px;margin-bottom:12px;background:${s.bg};border:1px solid ${s.border};color:${s.color}">${window.escHtml(msg)}</div>`;
    setTimeout(() => { el.innerHTML = ''; }, 5000);
  };

  // ── HTTP helpers with credentials ─────────────────────────────────────

  async function apiFetch(url, opts) {
    opts = opts || {};
    const r = await fetch(url, Object.assign({ credentials: 'include' }, opts));
    if (r.status === 401) {
      window.location.href = '/index.html';
      throw new Error('Session expired');
    }
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    return data;
  }

  window.GET   = function GET(url)       { return apiFetch(url); };
  window.POST  = function POST(url, d)   { return apiFetch(url, { method: 'POST',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }); };
  window.PUT   = function PUT(url, d)    { return apiFetch(url, { method: 'PUT',   headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }); };
  window.PATCH = function PATCH(url, d)  { return apiFetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }); };
  window.DEL   = function DEL(url)       { return apiFetch(url, { method: 'DELETE' }); };

  // ── Auth guard ────────────────────────────────────────────────────────

  let _user = null;

  window.requireLogin = async function requireLogin() {
    if (_user) return _user;
    try {
      const r = await fetch('/api/auth/me', { credentials: 'include' });
      if (!r.ok) throw new Error('Not authenticated');
      const data = await r.json();
      if (!data.user) throw new Error('Not authenticated');
      _user = data.user;
      return _user;
    } catch {
      window.location.href = '/index.html';
      return null;
    }
  };

  // ── Layout init (runs on every page load) ─────────────────────────────

  async function initLayout() {
    // ── Auth check ─────────────────────────────────────────────────────
    let user;
    try {
      const r = await fetch('/api/auth/me', { credentials: 'include' });
      if (!r.ok) { window.location.href = '/index.html'; return; }
      const data = await r.json();
      if (!data.user) { window.location.href = '/index.html'; return; }
      user = data.user;
      _user = user;
    } catch {
      window.location.href = '/index.html';
      return;
    }

    const isAdmin = user.role === 'admin';
    const currentPage = getCurrentPage();
    const initials = (user.full_name || user.username || 'U').charAt(0).toUpperCase();

    // ── Build full sidebar ─────────────────────────────────────────
    const sidebarEl = document.getElementById('sidebar');
    if (sidebarEl) {
      let navHtml = '';
      for (const item of NAV) {
        if (item.section) {
          if (!isAdmin && ['BILLING', 'SYSTEM'].includes(item.section)) continue;
          navHtml += `<div style="font-size:10px;font-weight:700;letter-spacing:1.2px;color:var(--text-muted,#555);padding:14px 16px 4px;text-transform:uppercase">${item.section}</div>`;
          continue;
        }
        if (item.adminOnly && !isAdmin) continue;
        const pageKey = item.href.replace(/^\//, '');
        const active  = currentPage === pageKey || window.location.pathname.includes('/' + pageKey);
        const activeBg = active ? 'rgba(255,215,0,.08)' : 'transparent';
        const activeColor = active ? 'var(--gold,#FFD700)' : 'var(--text,#ccc)';
        const activeBorder = active ? 'var(--gold,#FFD700)' : 'transparent';
        const activeWeight = active ? '600' : '400';
        navHtml += `<a href="${item.href}" style="display:flex;align-items:center;gap:10px;padding:10px 16px;text-decoration:none;color:${activeColor};background:${activeBg};border-left:3px solid ${activeBorder};font-size:13px;font-weight:${activeWeight};transition:background .15s,color .15s"
          onmouseover="this.style.background='rgba(255,255,255,.04)'"
          onmouseout="this.style.background='${activeBg}'"
        >${item.icon}&nbsp;${item.label}</a>`;
      }
      sidebarEl.innerHTML = `
        <div style="padding:18px 16px 14px;border-bottom:1px solid var(--border,#3a3a3a)">
          <h1 style="font-size:15px;font-weight:700;color:var(--gold,#FFD700);line-height:1.2">SpinePay Pro</h1>
          <p style="font-size:11px;color:var(--text-muted,#888);margin-top:2px">Walden Bailey Chiropractic</p>
        </div>
        <nav id="nav-links" style="flex:1;overflow-y:auto">${navHtml}</nav>
        <div id="sidebar-footer" style="margin-top:auto;padding:12px 16px;border-top:1px solid var(--border,#3a3a3a)">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#d4af37,#a08020);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#000;flex-shrink:0">${initials}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;color:#e0e0e0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${window.escHtml(user.full_name || user.username)}</div>
              <div style="font-size:11px;color:var(--gold,#FFD700);text-transform:uppercase;letter-spacing:.5px">${user.role}</div>
            </div>
          </div>
        </div>`;
    }

    // ── Build full topbar ────────────────────────────────────────────
    const topbarEl = document.getElementById('topbar');
    if (topbarEl) {
      const pageTitle = (document.title || 'SpinePay Pro').replace(/ [—–-].*$/, '').trim();
      topbarEl.innerHTML = `
        <h2 style="font-size:16px;font-weight:600;color:var(--gold,#FFD700);flex:1">${window.escHtml(pageTitle)}</h2>
        <span class="clock" id="clock" style="font-size:13px;color:var(--text-muted,#888);font-variant-numeric:tabular-nums"></span>
        <div style="display:flex;align-items:center;gap:8px;background:var(--bg3,#2e2e2e);border:1px solid var(--border,#3a3a3a);padding:4px 12px 4px 6px;border-radius:20px;">
          <div style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#d4af37,#a08020);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#000;flex-shrink:0">${initials}</div>
          <span style="font-size:12px;color:var(--gold,#FFD700)">${window.escHtml(user.full_name || user.username)}</span>
        </div>
        <button class="btn-logout" id="logout-btn" style="background:none;border:1px solid var(--border,#3a3a3a);color:var(--text-muted,#888);padding:5px 10px;border-radius:6px;cursor:pointer;font-size:12px">Logout</button>`;
    }

    // ── Clock ────────────────────────────────────────────────────────
    function tick() {
      const el = document.getElementById('clock');
      if (el) el.textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    tick();
    setInterval(tick, 1000);

    // ── Logout button ────────────────────────────────────────────────
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.onclick = async function () {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
        window.location.href = '/index.html';
      };
    }
  }

  document.addEventListener('DOMContentLoaded', initLayout);

})();
