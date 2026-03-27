'use strict';

// ── SpinePay Pro — Shared Layout for Standalone Pages ─────────────────────
// Provides: sidebar nav rendering, auth guard, clock, user info, and all
// utility globals used by every page in public/pages/

(function () {

  // ── Nav definition ────────────────────────────────────────────────────
  const NAV = [
    { section: 'MAIN' },
    { label: 'Dashboard',        href: '/dashboard',      icon: '📊', adminOnly: false },
    { label: 'Patients',         href: '/patients',       icon: '👥', adminOnly: false },
    { label: 'Documents',        href: '/documents',      icon: '📁', adminOnly: false },
    { label: 'Scheduling',       href: '/scheduling',     icon: '📅', adminOnly: false },
    { section: 'CLINICAL' },
    { label: 'SOAP Notes',       href: '/soap-notes',     icon: '📋', adminOnly: false },
    { label: 'Intake Forms',     href: '/intake-forms',   icon: '📝', adminOnly: false },
    { section: 'BILLING' },
    { label: 'Billing & Claims', href: '/billing',        icon: '💵', adminOnly: true  },
    { label: 'EOB & Receipts',   href: '/eob-records',    icon: '🧾', adminOnly: true  },
    { section: 'OPERATIONS' },
    { label: 'Transportation',   href: '/transportation', icon: '🚗', adminOnly: false },
    { label: 'PI Cases',         href: '/pi-cases',       icon: '⚖️', adminOnly: false },
    { label: 'Waitlist',         href: '/waitlist',       icon: '📋', adminOnly: false },
    { section: 'NETWORK' },
    { label: 'Referrals',        href: '/referrals',      icon: '🔗', adminOnly: false },
    { section: 'STAFF' },
    { label: 'Time Clock',       href: '/time-clock',     icon: '⏰', adminOnly: false },
    { label: 'Reminders',        href: '/reminders',      icon: '🔔', adminOnly: false },
    { section: 'SYSTEM' },
    { label: 'Staff',            href: '/staff',          icon: '👤', adminOnly: true  },
    { label: 'Settings',         href: '/settings',       icon: '⚙️', adminOnly: true  },
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
    // Auth check
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

    // ── Build sidebar nav ──────────────────────────────────────────────
    const navEl = document.getElementById('nav-links');
    if (navEl) {
      let html = '';
      for (const item of NAV) {
        if (item.section) {
          if (!isAdmin && ['BILLING', 'SYSTEM'].includes(item.section)) continue;
          html += `<div style="font-size:10px;font-weight:700;letter-spacing:1.2px;color:var(--text-muted,#555);padding:14px 16px 4px;text-transform:uppercase">${item.section}</div>`;
          continue;
        }
        if (item.adminOnly && !isAdmin) continue;
        const pageKey = item.href.replace(/^\//, '');
        const active  = currentPage === pageKey || window.location.pathname.includes('/' + pageKey);
        html += `<a href="${item.href}" style="display:flex;align-items:center;gap:10px;padding:10px 16px;text-decoration:none;color:${active ? 'var(--gold,#FFD700)' : 'var(--text,#ccc)'};background:${active ? 'rgba(255,215,0,.08)' : 'transparent'};border-left:3px solid ${active ? 'var(--gold,#FFD700)' : 'transparent'};font-size:13px;font-weight:${active ? '600' : '400'};transition:background .15s,color .15s"
          onmouseover="if(!this.classList.contains('nav-active'))this.style.background='rgba(255,255,255,.04)'"
          onmouseout="if(!this.classList.contains('nav-active'))this.style.background='${active ? 'rgba(255,215,0,.08)' : 'transparent'}'"
        >${item.icon}&nbsp;${item.label}</a>`;
      }
      navEl.innerHTML = html;
    }

    // ── Clock ──────────────────────────────────────────────────────────
    function tick() {
      const el = document.getElementById('clock');
      if (el) el.textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    tick();
    setInterval(tick, 1000);

    // ── Topbar user badge ──────────────────────────────────────────────
    const badgeEl = document.querySelector('.user-badge');
    if (badgeEl) {
      badgeEl.textContent = user.full_name || user.username;
      badgeEl.style.cssText = 'font-size:13px;color:var(--text-muted,#888);padding:0 8px;white-space:nowrap';
    }

    // ── Sidebar footer ─────────────────────────────────────────────────
    const footerEl = document.getElementById('sidebar-footer');
    if (footerEl) {
      const initials = (user.full_name || user.username || 'U').charAt(0).toUpperCase();
      footerEl.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-top:1px solid rgba(255,255,255,.06)">
        <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#d4af37,#a08020);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#000;flex-shrink:0">${initials}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:#e0e0e0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${window.escHtml(user.full_name || user.username)}</div>
          <div style="font-size:11px;color:var(--gold,#FFD700);text-transform:uppercase;letter-spacing:.5px">${user.role}</div>
        </div>
      </div>`;
    }

    // ── Logout button ──────────────────────────────────────────────────
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.onclick = async function () {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
        window.location.href = '/index.html';
      };
    }

    // ── Reveal page — no more flash ────────────────────────────────────
    document.body.classList.add('layout-ready');
  }

  document.addEventListener('DOMContentLoaded', initLayout);

})();
