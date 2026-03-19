'use strict';

// ── Reminders Module ──────────────────────────────────────────────────────────
window.Reminders = (() => {
  const { toast, confirm, openModal, closeModal, formatDate, formatTime, getCurrentUser } = window.App;

  let allTemplates    = [];
  let reminderLog     = [];
  let allPatients     = [];
  let todayAppts      = [];
  let editingTemplateId = null;
  let activeTab         = 'templates';
  let logTypeFilter     = 'all';

  // ── Access gate: admin only ────────────────────────────────────────────────
  function buildAccessDenied() {
    return `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:320px;gap:14px;">
        <div style="width:64px;height:64px;border-radius:50%;background:rgba(212,175,55,0.1);border:2px solid rgba(212,175,55,0.2);display:flex;align-items:center;justify-content:center;">
          <i class="fa-solid fa-lock" style="font-size:24px;color:var(--gold);opacity:0.6;"></i>
        </div>
        <div style="text-align:center;">
          <div style="font-size:18px;font-weight:700;color:var(--text-primary);margin-bottom:6px;">Admin Access Required</div>
          <div style="font-size:13px;color:var(--text-muted);">The Reminders module is restricted to admin users only.</div>
        </div>
      </div>`;
  }

  // ── Build HTML ─────────────────────────────────────────────────────────────
  function buildHTML() {
    return `
      <div class="section-header mb-16">
        <div class="section-title">Reminders <span>&amp; Notifications</span></div>
        <button class="btn btn-primary" id="newTemplateBtn" style="display:none;">
          <i class="fa-solid fa-plus"></i> New Template
        </button>
      </div>

      <div class="card card-gold mb-16">
        <!-- Tabs -->
        <div class="tabs" id="reminderTabs">
          <button class="tab-btn active" data-tab="templates">
            <i class="fa-solid fa-layer-group"></i> Templates
          </button>
          <button class="tab-btn" data-tab="log">
            <i class="fa-solid fa-clock-rotate-left"></i> Log
          </button>
        </div>

        <!-- TEMPLATES TAB -->
        <div class="tab-pane active" id="reminder-tab-templates">
          <div id="templatesList" style="padding:16px;display:grid;gap:12px;">
            <div class="table-empty" style="padding:40px;"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading...</p></div>
          </div>
        </div>

        <!-- LOG TAB -->
        <div class="tab-pane" id="reminder-tab-log">
          <div class="filter-bar">
            <div class="filter-chips" id="logFilterChips">
              <button class="filter-chip active" data-type="all">All</button>
              <button class="filter-chip" data-type="sms">SMS</button>
              <button class="filter-chip" data-type="email">Email</button>
            </div>
          </div>
          <div class="table-wrapper">
            <table id="reminderLogTable">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Type</th>
                  <th>Recipient</th>
                  <th>Status</th>
                  <th>Sent At</th>
                  <th>Message Preview</th>
                </tr>
              </thead>
              <tbody id="reminderLogBody">
                <tr><td colspan="6"><div class="table-empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading...</p></div></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Send Reminder Panel -->
      <div class="card card-gold" id="sendReminderPanel">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;">
          <i class="fa-solid fa-paper-plane" style="color:var(--gold);"></i>
          <span style="font-size:14px;font-weight:700;color:var(--text-primary);">Send Reminder</span>
        </div>
        <div style="padding:20px;">
          <div class="form-grid form-grid-2">
            <div class="form-group">
              <label class="form-label">Select Appointment</label>
              <select class="form-control" id="sendReminderAppt">
                <option value="">Select appointment...</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Select Template</label>
              <select class="form-control" id="sendReminderTemplate">
                <option value="">Select template...</option>
              </select>
            </div>
          </div>

          <!-- Message preview -->
          <div id="reminderPreviewWrap" style="display:none;margin-top:4px;">
            <label class="form-label">Message Preview</label>
            <div id="reminderPreview"
              style="padding:14px;background:var(--bg-mid);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;color:var(--text-primary);line-height:1.6;white-space:pre-wrap;min-height:60px;"></div>
          </div>

          <div style="margin-top:14px;display:flex;justify-content:flex-end;">
            <button class="btn btn-primary" id="sendReminderBtn">
              <i class="fa-solid fa-paper-plane"></i> Send Reminder
            </button>
          </div>
        </div>
      </div>

      <!-- New / Edit Template Modal -->
      <div class="modal-overlay" id="templateModal">
        <div class="modal modal-md">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-layer-group"></i> <span id="templateModalTitle">New Template</span></div>
            <button class="modal-close" id="templateModalClose">&times;</button>
          </div>
          <div class="modal-body">
            <form id="templateForm">
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label">Template Name <span class="required">*</span></label>
                  <input type="text" class="form-control" id="tplName" required placeholder="e.g. 24h Appointment Reminder" />
                </div>
                <div class="form-group">
                  <label class="form-label">Type</label>
                  <select class="form-control" id="tplType">
                    <option value="sms">SMS</option>
                    <option value="email">Email</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Trigger Hours Before</label>
                  <input type="number" class="form-control" id="tplTriggerHours" value="24" min="1" max="720" />
                </div>
                <div class="form-group" id="tplSubjectGroup" style="display:none;">
                  <label class="form-label">Subject (Email)</label>
                  <input type="text" class="form-control" id="tplSubject" placeholder="Email subject line..." />
                </div>
                <div class="form-group full-width">
                  <label class="form-label">Message Body <span class="required">*</span></label>
                  <textarea class="form-control" id="tplBody" rows="5" required placeholder="Enter message..."></textarea>
                  <div style="margin-top:6px;font-size:11px;color:var(--text-muted);">
                    Available placeholders: <code style="background:var(--bg-mid);padding:1px 5px;border-radius:3px;">{{patient_name}}</code>
                    <code style="background:var(--bg-mid);padding:1px 5px;border-radius:3px;">{{date}}</code>
                    <code style="background:var(--bg-mid);padding:1px 5px;border-radius:3px;">{{time}}</code>
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Active</label>
                  <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
                    <label class="toggle-switch">
                      <input type="checkbox" id="tplActive" checked />
                      <span class="toggle-slider"></span>
                    </label>
                    <span style="font-size:13px;color:var(--text-muted);" id="tplActiveLabel">Active</span>
                  </div>
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="templateModalCancel">Cancel</button>
            <button class="btn btn-primary" id="templateModalSave">
              <i class="fa-solid fa-floppy-disk"></i> Save Template
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  async function render() {
    const view = document.getElementById('view-reminders');
    const user = getCurrentUser();

    if (user?.role !== 'admin') {
      view.innerHTML = buildAccessDenied();
      return;
    }

    if (!view.querySelector('.section-header')) {
      view.innerHTML = buildHTML();
      bindEvents();
    }

    // Show the New Template button now that we know it's admin
    const newTplBtn = document.getElementById('newTemplateBtn');
    if (newTplBtn) newTplBtn.style.display = '';

    await loadAll();
  }

  async function loadAll() {
    try {
      const today = window.App.todayString();
      [allTemplates, reminderLog, allPatients, todayAppts] = await Promise.all([
        window.api.reminders.getTemplates(),
        window.api.reminders.getLog(),
        window.api.patients.getAll(),
        window.api.appointments.getByDate(today, today)
      ]);
      renderTemplates();
      renderLog();
      populateSendPanel();
    } catch (err) {
      console.error('Reminders loadAll error:', err);
      toast('Failed to load reminders data', 'error');
    }
  }

  // ── Templates ──────────────────────────────────────────────────────────────
  function templateTypeBadge(type) {
    const cfg = {
      sms:   { icon: 'fa-comment-sms',   cls: 'template-type-sms',   label: 'SMS'   },
      email: { icon: 'fa-envelope',       cls: 'template-type-email', label: 'Email' }
    };
    const t = cfg[type] || cfg.sms;
    return `<span class="template-type-badge ${t.cls}"><i class="fa-solid ${t.icon}"></i> ${t.label}</span>`;
  }

  function renderTemplates() {
    const container = document.getElementById('templatesList');
    if (!container) return;

    if (allTemplates.length === 0) {
      container.innerHTML = `
        <div class="table-empty" style="padding:40px;">
          <i class="fa-solid fa-layer-group" style="font-size:2rem;color:var(--gold);opacity:0.4;margin-bottom:10px;"></i>
          <p style="font-weight:600;font-size:14px;">No templates yet</p>
          <p style="font-size:12px;color:var(--text-muted);">Click "New Template" to create your first reminder template.</p>
        </div>`;
      return;
    }

    container.innerHTML = allTemplates.map(t => `
      <div class="template-card" style="display:flex;align-items:center;gap:14px;padding:16px;background:var(--bg-mid);border:1px solid var(--border);border-radius:var(--radius);transition:border-color .2s;" onmouseenter="this.style.borderColor='var(--gold)'" onmouseleave="this.style.borderColor='var(--border)'">
        <div style="width:40px;height:40px;border-radius:50%;background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <i class="fa-solid ${t.type === 'email' ? 'fa-envelope' : 'fa-comment-sms'}" style="color:var(--gold);"></i>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
            <span style="font-size:14px;font-weight:700;color:var(--text-primary);">${t.name}</span>
            ${templateTypeBadge(t.type)}
            <span style="font-size:11px;color:var(--text-muted);"><i class="fa-regular fa-clock"></i> ${t.trigger_hours || 24}h before</span>
            <span style="margin-left:auto;">
              ${t.active
                ? '<span style="font-size:11px;color:var(--success);font-weight:600;"><i class="fa-solid fa-circle" style="font-size:7px;"></i> Active</span>'
                : '<span style="font-size:11px;color:var(--text-muted);"><i class="fa-regular fa-circle" style="font-size:7px;"></i> Inactive</span>'
              }
            </span>
          </div>
          ${t.subject ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:3px;"><b>Subject:</b> ${t.subject}</div>` : ''}
          <div style="font-size:12px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;">${t.body || ''}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button class="btn btn-icon btn-sm btn-outline" title="Edit template" onclick="window.Reminders.openEditTemplate(${t.id})">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn btn-icon btn-sm btn-danger" title="Delete template" onclick="window.Reminders.deleteTemplate(${t.id})">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `).join('');
  }

  // ── Log ────────────────────────────────────────────────────────────────────
  function renderLog() {
    const filtered = logTypeFilter === 'all'
      ? reminderLog
      : reminderLog.filter(e => e.type === logTypeFilter);

    const tbody = document.getElementById('reminderLogBody');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="table-empty"><i class="fa-solid fa-clock-rotate-left"></i><p>No reminder log entries</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(entry => {
      const typeIcon  = entry.type === 'email' ? 'fa-envelope' : 'fa-comment-sms';
      const typeColor = entry.type === 'email' ? 'var(--info)' : 'var(--gold)';

      const statusColor = {
        'sent':    'var(--success)',
        'failed':  'var(--danger)',
        'pending': 'var(--warning)'
      }[entry.status] || 'var(--text-muted)';

      const statusLabel = { sent: 'Sent', failed: 'Failed', pending: 'Pending' }[entry.status] || entry.status;

      const sentAt = entry.sent_at
        ? new Date(entry.sent_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
        : '—';

      const preview = (entry.message || '').length > 60
        ? (entry.message || '').substring(0, 60) + '…'
        : (entry.message || '—');

      return `<tr>
        <td class="td-primary">${entry.patient_name || '—'}</td>
        <td>
          <span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;color:${typeColor};font-weight:600;">
            <i class="fa-solid ${typeIcon}"></i> ${entry.type === 'email' ? 'Email' : 'SMS'}
          </span>
        </td>
        <td style="font-size:12px;">${entry.recipient || '—'}</td>
        <td>
          <span style="font-size:12px;font-weight:600;color:${statusColor};">
            <i class="fa-solid fa-circle" style="font-size:7px;"></i> ${statusLabel}
          </span>
        </td>
        <td style="font-size:12px;color:var(--text-muted);">${sentAt}</td>
        <td style="font-size:12px;color:var(--text-muted);max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${(entry.message || '').replace(/"/g, '&quot;')}">${preview}</td>
      </tr>`;
    }).join('');
  }

  // ── Send Reminder Panel ────────────────────────────────────────────────────
  function populateSendPanel() {
    // Populate appointments select (today's appts)
    const apptSel = document.getElementById('sendReminderAppt');
    if (apptSel) {
      apptSel.innerHTML = '<option value="">Select appointment...</option>' +
        todayAppts.map(a =>
          `<option value="${a.id}">${a.last_name}, ${a.first_name} — ${formatTime(a.time)} (${a.type || 'visit'})</option>`
        ).join('');
    }

    // Populate templates select (active only)
    const tplSel = document.getElementById('sendReminderTemplate');
    if (tplSel) {
      const activeTemplates = allTemplates.filter(t => t.active);
      tplSel.innerHTML = '<option value="">Select template...</option>' +
        activeTemplates.map(t =>
          `<option value="${t.id}">${t.name} (${t.type === 'email' ? 'Email' : 'SMS'})</option>`
        ).join('');
    }
  }

  function updateReminderPreview() {
    const apptId = document.getElementById('sendReminderAppt')?.value;
    const tplId  = document.getElementById('sendReminderTemplate')?.value;
    const wrap   = document.getElementById('reminderPreviewWrap');
    const prev   = document.getElementById('reminderPreview');
    if (!wrap || !prev) return;

    if (!apptId || !tplId) {
      wrap.style.display = 'none';
      return;
    }

    const appt = todayAppts.find(a => String(a.id) === String(apptId));
    const tpl  = allTemplates.find(t => String(t.id) === String(tplId));

    if (!appt || !tpl) { wrap.style.display = 'none'; return; }

    const rendered = (tpl.body || '')
      .replace(/\{\{patient_name\}\}/g, `${appt.first_name} ${appt.last_name}`)
      .replace(/\{\{date\}\}/g, formatDate(appt.date))
      .replace(/\{\{time\}\}/g, formatTime(appt.time));

    prev.textContent  = rendered;
    wrap.style.display = '';
  }

  async function sendReminder() {
    const apptId = document.getElementById('sendReminderAppt')?.value;
    const tplId  = document.getElementById('sendReminderTemplate')?.value;

    if (!apptId) { toast('Please select an appointment', 'warning'); return; }
    if (!tplId)  { toast('Please select a template', 'warning'); return; }

    const btn = document.getElementById('sendReminderBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

    try {
      await window.api.reminders.send(parseInt(apptId), parseInt(tplId));
      toast('Reminder sent successfully', 'success');
      // Reset selects
      document.getElementById('sendReminderAppt').value     = '';
      document.getElementById('sendReminderTemplate').value = '';
      document.getElementById('reminderPreviewWrap').style.display = 'none';
      await loadAll();
    } catch (err) {
      console.error(err);
      toast('Failed to send reminder', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Reminder';
    }
  }

  // ── Template CRUD ──────────────────────────────────────────────────────────
  function openNewTemplate() {
    editingTemplateId = null;
    const titleEl = document.getElementById('templateModalTitle');
    if (titleEl) titleEl.textContent = 'New Template';
    document.getElementById('templateForm')?.reset();
    document.getElementById('tplActive').checked = true;
    document.getElementById('tplActiveLabel').textContent = 'Active';
    document.getElementById('tplTriggerHours').value = '24';
    toggleSubjectField('sms');
    openModal('templateModal');
  }

  function openEditTemplate(id) {
    const t = allTemplates.find(x => x.id === id);
    if (!t) return;
    editingTemplateId = id;

    const titleEl = document.getElementById('templateModalTitle');
    if (titleEl) titleEl.textContent = 'Edit Template';

    document.getElementById('tplName').value         = t.name || '';
    document.getElementById('tplType').value         = t.type || 'sms';
    document.getElementById('tplTriggerHours').value = t.trigger_hours || 24;
    document.getElementById('tplSubject').value      = t.subject || '';
    document.getElementById('tplBody').value         = t.body || '';
    document.getElementById('tplActive').checked     = !!t.active;
    document.getElementById('tplActiveLabel').textContent = t.active ? 'Active' : 'Inactive';
    toggleSubjectField(t.type);
    openModal('templateModal');
  }

  function toggleSubjectField(type) {
    const group = document.getElementById('tplSubjectGroup');
    if (group) group.style.display = type === 'email' ? '' : 'none';
  }

  async function saveTemplate() {
    const name = document.getElementById('tplName').value.trim();
    const body = document.getElementById('tplBody').value.trim();
    const type = document.getElementById('tplType').value;

    if (!name) { toast('Please enter a template name', 'warning'); return; }
    if (!body) { toast('Please enter a message body', 'warning'); return; }

    const data = {
      name,
      type,
      trigger_hours: parseInt(document.getElementById('tplTriggerHours').value) || 24,
      subject:       type === 'email' ? (document.getElementById('tplSubject').value.trim() || null) : null,
      body,
      active:        document.getElementById('tplActive').checked ? 1 : 0
    };

    const btn = document.getElementById('templateModalSave');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
      if (editingTemplateId) {
        await window.api.reminders.updateTemplate(editingTemplateId, data);
        toast('Template updated', 'success');
      } else {
        await window.api.reminders.createTemplate(data);
        toast('Template created', 'success');
      }
      closeModal('templateModal');
      await loadAll();
    } catch (err) {
      console.error(err);
      toast('Failed to save template', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Template';
    }
  }

  async function deleteTemplate(id) {
    const confirmed = await confirm('Delete this reminder template?', 'Delete', 'btn-danger');
    if (!confirmed) return;
    try {
      // Use updateTemplate to set deleted flag, or if API provides delete:
      await (window.api.reminders.deleteTemplate
        ? window.api.reminders.deleteTemplate(id)
        : window.api.reminders.updateTemplate(id, { deleted: 1 }));
      toast('Template deleted', 'success');
      await loadAll();
    } catch (err) {
      toast('Failed to delete template', 'error');
    }
  }

  // ── Bind Events ───────────────────────────────────────────────────────────
  function bindEvents() {
    document.getElementById('newTemplateBtn')?.addEventListener('click', openNewTemplate);
    document.getElementById('templateModalSave')?.addEventListener('click', saveTemplate);
    document.getElementById('sendReminderBtn')?.addEventListener('click', sendReminder);

    // Tab switching
    document.getElementById('reminderTabs')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      document.querySelectorAll('#reminderTabs .tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('#view-reminders .tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      const pane = document.getElementById(`reminder-tab-${activeTab}`);
      if (pane) pane.classList.add('active');
    });

    // Log type filter chips
    document.getElementById('logFilterChips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;
      document.querySelectorAll('#logFilterChips .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      logTypeFilter = chip.dataset.type;
      renderLog();
    });

    // Template type toggle → show/hide subject
    document.getElementById('tplType')?.addEventListener('change', (e) => {
      toggleSubjectField(e.target.value);
    });

    // Active toggle label
    document.getElementById('tplActive')?.addEventListener('change', (e) => {
      const label = document.getElementById('tplActiveLabel');
      if (label) label.textContent = e.target.checked ? 'Active' : 'Inactive';
    });

    // Send panel preview updates
    document.getElementById('sendReminderAppt')?.addEventListener('change', updateReminderPreview);
    document.getElementById('sendReminderTemplate')?.addEventListener('change', updateReminderPreview);

    window.App.setupModalClose('templateModal', ['templateModalClose', 'templateModalCancel']);
  }

  return {
    render,
    openEditTemplate,
    deleteTemplate,
    refresh: loadAll
  };
})();
