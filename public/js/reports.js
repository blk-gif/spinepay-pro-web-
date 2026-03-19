'use strict';

// ── Reports Module ────────────────────────────────────────────────────────────
window.Reports = (() => {
  const { toast, formatCurrency, formatDate, getCurrentUser, todayString } = window.App;

  let revenueChart       = null;
  let apptChart          = null;
  let insurerChart       = null;
  let chartJsLoaded      = false;
  let currentStartDate   = null;
  let currentEndDate     = null;

  // ── Build HTML ──────────────────────────────────────────────────────────────
  function buildHTML() {
    return `
      <div id="reports-access-denied" style="display:none;text-align:center;padding:80px 20px;">
        <i class="fa-solid fa-lock" style="font-size:3rem;color:var(--gold);opacity:0.4;margin-bottom:20px;"></i>
        <div style="font-size:20px;font-weight:700;color:var(--text-primary);margin-bottom:10px;">Admin Access Required</div>
        <div style="font-size:14px;color:var(--text-muted);">Reports and revenue analytics are restricted to admin users.</div>
      </div>

      <div id="reports-main">
        <!-- Period Selector Bar -->
        <div class="card card-gold" style="margin-bottom:18px;">
          <div style="padding:14px 20px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-right:4px;">Period:</span>
            <button class="btn btn-sm period-preset-btn active" data-preset="this-month">This Month</button>
            <button class="btn btn-sm period-preset-btn" data-preset="last-month">Last Month</button>
            <button class="btn btn-sm period-preset-btn" data-preset="last-3-months">Last 3 Months</button>
            <button class="btn btn-sm period-preset-btn" data-preset="last-6-months">Last 6 Months</button>
            <button class="btn btn-sm period-preset-btn" data-preset="this-year">This Year</button>
            <div style="width:1px;height:24px;background:var(--border);margin:0 4px;"></div>
            <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-secondary);">
              <label>From</label>
              <input type="date" class="form-control" id="reportStartDate" style="width:140px;font-size:12px;padding:5px 8px;" />
              <label>To</label>
              <input type="date" class="form-control" id="reportEndDate" style="width:140px;font-size:12px;padding:5px 8px;" />
              <button class="btn btn-sm btn-outline" id="reportCustomRange">
                <i class="fa-solid fa-magnifying-glass"></i> Apply
              </button>
            </div>
            <div style="flex:1;"></div>
            <button class="btn btn-sm btn-outline" id="reportRefreshBtn" title="Refresh">
              <i class="fa-solid fa-arrows-rotate"></i>
            </button>
          </div>
          <div style="padding:4px 20px 12px;font-size:12px;color:var(--text-muted);" id="reportPeriodLabel">
            <i class="fa-solid fa-calendar-range" style="margin-right:6px;color:var(--gold);"></i>
            Loading period...
          </div>
        </div>

        <!-- Loading spinner overlay -->
        <div id="reportsLoadingOverlay" style="display:none;text-align:center;padding:60px 20px;">
          <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;color:var(--gold);"></i>
          <p style="margin-top:14px;color:var(--text-muted);">Loading report data...</p>
        </div>

        <div id="reportsContent">
          <!-- Summary Stats Row -->
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px;" id="reportsSummaryRow">
            ${statCard('reports-total-revenue', 'fa-sack-dollar', 'Total Revenue', '—', '#27ae60')}
            ${statCard('reports-claims-rate',   'fa-chart-pie',  'Claims Success Rate', '—', '#d4af37')}
            ${statCard('reports-new-patients',  'fa-user-plus',  'New Patients', '—', '#3498db')}
          </div>

          <!-- Charts Row: Revenue + Appointments -->
          <div style="display:grid;grid-template-columns:3fr 2fr;gap:18px;margin-bottom:20px;">
            <div class="card card-gold">
              <div style="padding:14px 18px 10px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
                <div style="font-weight:700;font-size:14px;"><i class="fa-solid fa-chart-bar" style="color:var(--gold);margin-right:8px;"></i>Revenue Over Time</div>
                <span style="font-size:11px;color:var(--text-muted);">Monthly</span>
              </div>
              <div style="padding:16px;position:relative;height:280px;">
                <canvas id="revenueChart"></canvas>
              </div>
            </div>
            <div class="card card-gold">
              <div style="padding:14px 18px 10px;border-bottom:1px solid var(--border);">
                <div style="font-weight:700;font-size:14px;"><i class="fa-solid fa-circle-half-stroke" style="color:var(--gold);margin-right:8px;"></i>Appointment Breakdown</div>
              </div>
              <div style="padding:16px;position:relative;height:280px;display:flex;flex-direction:column;align-items:center;justify-content:center;">
                <canvas id="apptChart"></canvas>
              </div>
            </div>
          </div>

          <!-- Insurer Chart -->
          <div class="card card-gold" style="margin-bottom:20px;">
            <div style="padding:14px 18px 10px;border-bottom:1px solid var(--border);">
              <div style="font-weight:700;font-size:14px;"><i class="fa-solid fa-chart-bar" style="color:var(--gold);margin-right:8px;"></i>Insurance vs Self-Pay — Claims by Insurer</div>
            </div>
            <div style="padding:16px;position:relative;height:260px;">
              <canvas id="insurerChart"></canvas>
            </div>
          </div>

          <!-- Bottom Tables Row -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;">
            <!-- PI Cases Summary -->
            <div class="card card-gold">
              <div style="padding:14px 18px 10px;border-bottom:1px solid var(--border);">
                <div style="font-weight:700;font-size:14px;"><i class="fa-solid fa-car-burst" style="color:var(--gold);margin-right:8px;"></i>PI Cases Summary</div>
              </div>
              <div style="padding:0;">
                <table id="piSummaryTable" style="width:100%;border-collapse:collapse;">
                  <thead>
                    <tr>
                      <th style="padding:10px 16px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-muted);font-weight:700;border-bottom:1px solid var(--border);">Status</th>
                      <th style="padding:10px 16px;text-align:right;font-size:11px;text-transform:uppercase;color:var(--text-muted);font-weight:700;border-bottom:1px solid var(--border);">Count</th>
                      <th style="padding:10px 16px;text-align:right;font-size:11px;text-transform:uppercase;color:var(--text-muted);font-weight:700;border-bottom:1px solid var(--border);">Total Lien</th>
                    </tr>
                  </thead>
                  <tbody id="piSummaryBody">
                    <tr><td colspan="3" style="padding:30px;text-align:center;color:var(--text-muted);font-size:13px;"><i class="fa-solid fa-spinner fa-spin"></i></td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Referral Conversion -->
            <div class="card card-gold">
              <div style="padding:14px 18px 10px;border-bottom:1px solid var(--border);">
                <div style="font-weight:700;font-size:14px;"><i class="fa-solid fa-share-nodes" style="color:var(--gold);margin-right:8px;"></i>Referral Conversion</div>
              </div>
              <div style="padding:0;">
                <table id="referralConversionTable" style="width:100%;border-collapse:collapse;">
                  <thead>
                    <tr>
                      <th style="padding:10px 16px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-muted);font-weight:700;border-bottom:1px solid var(--border);">Status</th>
                      <th style="padding:10px 16px;text-align:right;font-size:11px;text-transform:uppercase;color:var(--text-muted);font-weight:700;border-bottom:1px solid var(--border);">Count</th>
                    </tr>
                  </thead>
                  <tbody id="referralConversionBody">
                    <tr><td colspan="2" style="padding:30px;text-align:center;color:var(--text-muted);font-size:13px;"><i class="fa-solid fa-spinner fa-spin"></i></td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function statCard(id, icon, label, value, color) {
    return `
      <div class="card card-gold">
        <div style="padding:20px 22px;display:flex;align-items:center;gap:16px;">
          <div style="width:48px;height:48px;border-radius:12px;background:${color}22;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i class="fa-solid ${icon}" style="font-size:20px;color:${color};"></i>
          </div>
          <div>
            <div id="${id}" style="font-size:26px;font-weight:900;color:${color};">${value}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${label}</div>
          </div>
        </div>
      </div>
    `;
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  async function render() {
    const view = document.getElementById('view-reports');
    if (!view.querySelector('#reports-main')) {
      view.innerHTML = buildHTML();
      bindEvents();
    }

    // Access check
    const user = getCurrentUser();
    if (!user || user.role !== 'admin') {
      document.getElementById('reports-access-denied').style.display = 'block';
      document.getElementById('reports-main').style.display = 'none';
      // Still show the denied block inside reports-main div hierarchy
      view.innerHTML = `
        <div style="text-align:center;padding:80px 20px;">
          <i class="fa-solid fa-lock" style="font-size:3.5rem;color:var(--gold);opacity:0.35;margin-bottom:22px;display:block;"></i>
          <div style="font-size:22px;font-weight:800;color:var(--text-primary);margin-bottom:10px;">Admin Access Required</div>
          <div style="font-size:14px;color:var(--text-muted);max-width:360px;margin:0 auto;line-height:1.6;">
            Reports and revenue analytics are restricted to admin users.<br>
            Please contact your administrator if you need access.
          </div>
        </div>
      `;
      return;
    }

    await loadChartJs();
    applyPreset('this-month');
  }

  // ── Load Chart.js from CDN ──────────────────────────────────────────────────
  function loadChartJs() {
    return new Promise((resolve) => {
      if (window.Chart) {
        chartJsLoaded = true;
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
      script.onload = () => { chartJsLoaded = true; resolve(); };
      script.onerror = () => {
        toast('Failed to load Chart.js from CDN. Charts may not display.', 'warning');
        resolve();
      };
      document.head.appendChild(script);
    });
  }

  // ── Period Presets ──────────────────────────────────────────────────────────
  function applyPreset(preset) {
    const now   = new Date();
    let start, end;

    switch (preset) {
      case 'this-month': {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      }
      case 'last-month': {
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end   = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      }
      case 'last-3-months': {
        start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        end   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      }
      case 'last-6-months': {
        start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        end   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      }
      case 'this-year': {
        start = new Date(now.getFullYear(), 0, 1);
        end   = new Date(now.getFullYear(), 11, 31);
        break;
      }
      default: {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      }
    }

    const startStr = start.toISOString().split('T')[0];
    const endStr   = end.toISOString().split('T')[0];

    // Sync date inputs
    const startEl = document.getElementById('reportStartDate');
    const endEl   = document.getElementById('reportEndDate');
    if (startEl) startEl.value = startStr;
    if (endEl)   endEl.value   = endStr;

    // Highlight active preset button
    document.querySelectorAll('.period-preset-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.preset === preset);
    });

    loadReport(startStr, endStr);
  }

  function applyCustomRange() {
    const start = document.getElementById('reportStartDate')?.value;
    const end   = document.getElementById('reportEndDate')?.value;
    if (!start || !end) { toast('Please select both a start and end date', 'warning'); return; }
    if (start > end) { toast('Start date must be before end date', 'warning'); return; }
    // Deactivate all presets
    document.querySelectorAll('.period-preset-btn').forEach(b => b.classList.remove('active'));
    loadReport(start, end);
  }

  // ── Load Report Data ────────────────────────────────────────────────────────
  async function loadReport(startDate, endDate) {
    currentStartDate = startDate;
    currentEndDate   = endDate;

    const overlay  = document.getElementById('reportsLoadingOverlay');
    const content  = document.getElementById('reportsContent');
    const label    = document.getElementById('reportPeriodLabel');

    if (overlay) overlay.style.display = 'block';
    if (content) content.style.opacity = '0.4';

    const startFmt = formatDate(startDate);
    const endFmt   = formatDate(endDate);
    if (label) label.innerHTML = `<i class="fa-solid fa-calendar-range" style="margin-right:6px;color:var(--gold);"></i>Showing data from <b style="color:var(--text-primary);">${startFmt}</b> to <b style="color:var(--text-primary);">${endFmt}</b>`;

    try {
      const data = await window.api.reports.fullDashboard(startDate, endDate);
      renderSummaryStats(data);
      if (chartJsLoaded && window.Chart) {
        renderRevenueChart(data);
        renderApptChart(data);
        renderInsurerChart(data);
      }
      renderPISummaryTable(data);
      renderReferralTable(data);
    } catch (err) {
      console.error(err);
      toast('Failed to load report data', 'error');
    } finally {
      if (overlay) overlay.style.display = 'none';
      if (content) content.style.opacity = '1';
    }
  }

  // ── Summary Stats ───────────────────────────────────────────────────────────
  function renderSummaryStats(data) {
    const revenue     = data.total_revenue   || data.total_collected || 0;
    const paidCount   = data.paid_count      || 0;
    const totalClaims = data.total_claims    || 1;
    const newPats     = data.new_patients    || 0;
    const successRate = totalClaims > 0 ? ((paidCount / totalClaims) * 100).toFixed(1) : '0.0';

    const el = id => document.getElementById(id);
    if (el('reports-total-revenue')) el('reports-total-revenue').textContent = formatCurrency(revenue);
    if (el('reports-claims-rate'))   el('reports-claims-rate').textContent   = `${successRate}%`;
    if (el('reports-new-patients'))  el('reports-new-patients').textContent  = newPats;
  }

  // ── Chart Defaults ──────────────────────────────────────────────────────────
  function darkDefaults() {
    return {
      color: '#ccc',
      plugins: {
        legend: {
          labels: { color: '#ccc', font: { size: 12 } }
        },
        tooltip: {
          backgroundColor: 'rgba(20,20,20,0.95)',
          titleColor: '#d4af37',
          bodyColor: '#ddd',
          borderColor: '#333',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          grid: { color: '#2a2a2a' },
          ticks: { color: '#999', font: { size: 11 } }
        },
        y: {
          grid: { color: '#2a2a2a' },
          ticks: { color: '#999', font: { size: 11 } }
        }
      }
    };
  }

  function destroyChart(chartRef) {
    if (chartRef) { try { chartRef.destroy(); } catch (_) {} }
    return null;
  }

  // ── Revenue Bar Chart ───────────────────────────────────────────────────────
  function renderRevenueChart(data) {
    const canvas = document.getElementById('revenueChart');
    if (!canvas) return;

    revenueChart = destroyChart(revenueChart);

    // Expect data.revenue_by_month: [{month:'2026-01', total:1234}, ...]
    const monthly = Array.isArray(data.revenue_by_month) ? data.revenue_by_month : [];

    const labels = monthly.map(m => {
      if (!m.month) return '';
      const [y, mo] = m.month.split('-');
      const d = new Date(parseInt(y), parseInt(mo) - 1, 1);
      return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    });
    const values = monthly.map(m => parseFloat(m.total || m.revenue || 0));

    const def = darkDefaults();
    revenueChart = new window.Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Revenue ($)',
          data: values,
          backgroundColor: 'rgba(212,175,55,0.75)',
          borderColor: '#d4af37',
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          ...def.plugins,
          legend: { display: false },
          tooltip: {
            ...def.plugins.tooltip,
            callbacks: {
              label: ctx => ' ' + formatCurrency(ctx.parsed.y)
            }
          }
        },
        scales: {
          x: { ...def.scales.x },
          y: {
            ...def.scales.y,
            ticks: {
              ...def.scales.y.ticks,
              callback: v => formatCurrency(v)
            }
          }
        }
      }
    });
  }

  // ── Appointment Doughnut ─────────────────────────────────────────────────────
  function renderApptChart(data) {
    const canvas = document.getElementById('apptChart');
    if (!canvas) return;

    apptChart = destroyChart(apptChart);

    // Expect data.appointments_by_status: [{status:'completed',count:40}, ...]
    const apptStatus = Array.isArray(data.appointments_by_status) ? data.appointments_by_status : [];

    const statusOrder   = ['completed', 'cancelled', 'no-show', 'scheduled', 'checked-in', 'in-progress'];
    const statusColors  = {
      'completed':   'rgba(39,174,96,0.85)',
      'cancelled':   'rgba(231,76,60,0.85)',
      'no-show':     'rgba(230,126,34,0.85)',
      'scheduled':   'rgba(52,152,219,0.85)',
      'checked-in':  'rgba(155,89,182,0.85)',
      'in-progress': 'rgba(212,175,55,0.85)'
    };

    const labels = [];
    const values = [];
    const colors = [];

    // Add in order, then any extra statuses
    const allStatuses = [...new Set([...statusOrder, ...apptStatus.map(a => a.status)])];
    allStatuses.forEach(s => {
      const row = apptStatus.find(a => a.status === s);
      if (row && row.count > 0) {
        labels.push(s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
        values.push(parseInt(row.count || 0));
        colors.push(statusColors[s] || 'rgba(150,150,150,0.7)');
      }
    });

    if (values.length === 0) {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#555';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No appointment data', canvas.width / 2, canvas.height / 2);
      return;
    }

    const def = darkDefaults();
    apptChart = new window.Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderColor: '#1a1a1a',
          borderWidth: 2,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#ccc',
              font: { size: 11 },
              padding: 12,
              boxWidth: 12
            }
          },
          tooltip: {
            ...def.plugins.tooltip,
            callbacks: {
              label: ctx => ` ${ctx.label}: ${ctx.parsed} appointments`
            }
          }
        },
        cutout: '60%'
      }
    });
  }

  // ── Insurer Horizontal Bar Chart ────────────────────────────────────────────
  function renderInsurerChart(data) {
    const canvas = document.getElementById('insurerChart');
    if (!canvas) return;

    insurerChart = destroyChart(insurerChart);

    // Expect data.claims_by_insurer: [{insurer:'Aetna', total_billed:5000, claim_count:10}, ...]
    const byInsurer = Array.isArray(data.claims_by_insurer) ? data.claims_by_insurer : [];
    const sorted    = [...byInsurer].sort((a, b) => (b.total_billed || 0) - (a.total_billed || 0)).slice(0, 12);

    const labels       = sorted.map(r => r.insurer || 'Unknown');
    const billedValues = sorted.map(r => parseFloat(r.total_billed || 0));
    const paidValues   = sorted.map(r => parseFloat(r.total_paid || 0));

    const barColors    = [
      'rgba(212,175,55,0.8)', 'rgba(52,152,219,0.8)', 'rgba(39,174,96,0.8)',
      'rgba(155,89,182,0.8)', 'rgba(230,126,34,0.8)', 'rgba(231,76,60,0.8)',
      'rgba(26,188,156,0.8)', 'rgba(241,196,15,0.8)', 'rgba(52,73,94,0.8)',
      'rgba(189,195,199,0.8)','rgba(243,156,18,0.8)', 'rgba(46,204,113,0.8)'
    ];

    const def = darkDefaults();
    insurerChart = new window.Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Billed',
            data: billedValues,
            backgroundColor: barColors.map(c => c.replace('0.8', '0.5')),
            borderColor: barColors,
            borderWidth: 1,
            borderRadius: 3
          },
          {
            label: 'Paid',
            data: paidValues,
            backgroundColor: barColors.map(c => c.replace('0.8', '0.85')),
            borderColor: barColors,
            borderWidth: 1,
            borderRadius: 3
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          ...def.plugins,
          legend: {
            position: 'top',
            labels: { color: '#ccc', font: { size: 11 }, padding: 14 }
          },
          tooltip: {
            ...def.plugins.tooltip,
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${formatCurrency(ctx.parsed.x)}`
            }
          }
        },
        scales: {
          x: {
            ...def.scales.x,
            stacked: false,
            ticks: {
              ...def.scales.x.ticks,
              callback: v => formatCurrency(v)
            }
          },
          y: { ...def.scales.y, stacked: false }
        }
      }
    });
  }

  // ── PI Cases Table ──────────────────────────────────────────────────────────
  function renderPISummaryTable(data) {
    const tbody = document.getElementById('piSummaryBody');
    if (!tbody) return;

    // Expect data.pi_cases_summary: [{case_status:'open', count:5, total_lien:25000}, ...]
    const rows = Array.isArray(data.pi_cases_summary) ? data.pi_cases_summary : [];

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;font-style:italic;">No PI case data for this period</td></tr>`;
      return;
    }

    const statusColors = {
      open: '#3498db', closed: '#2ecc71', 'in-litigation': '#e67e22',
      settled: '#27ae60', 'pending-settlement': '#d4af37'
    };

    tbody.innerHTML = rows.map(r => {
      const color = statusColors[r.case_status] || '#aaa';
      const label = (r.case_status || '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return `<tr>
        <td style="padding:10px 16px;font-size:13px;">
          <span style="display:inline-flex;align-items:center;gap:6px;">
            <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></span>
            ${label}
          </span>
        </td>
        <td style="padding:10px 16px;text-align:right;font-weight:700;color:var(--text-primary);">${r.count || 0}</td>
        <td style="padding:10px 16px;text-align:right;font-weight:700;color:var(--gold);">${formatCurrency(r.total_lien || 0)}</td>
      </tr>`;
    }).join('');
  }

  // ── Referral Table ──────────────────────────────────────────────────────────
  function renderReferralTable(data) {
    const tbody = document.getElementById('referralConversionBody');
    if (!tbody) return;

    // Expect data.referral_summary: [{status:'pending', count:8}, ...]
    const rows = Array.isArray(data.referral_summary) ? data.referral_summary : [];

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="2" style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;font-style:italic;">No referral data for this period</td></tr>`;
      return;
    }

    const statusColors = {
      pending: '#f39c12', converted: '#27ae60', contacted: '#3498db',
      declined: '#e74c3c', 'no-response': '#95a5a6'
    };

    tbody.innerHTML = rows.map(r => {
      const color = statusColors[r.status] || '#aaa';
      const label = (r.status || '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return `<tr>
        <td style="padding:10px 16px;font-size:13px;">
          <span style="display:inline-flex;align-items:center;gap:6px;">
            <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></span>
            ${label}
          </span>
        </td>
        <td style="padding:10px 16px;text-align:right;font-weight:700;color:var(--text-primary);">${r.count || 0}</td>
      </tr>`;
    }).join('');
  }

  // ── Bind Events ─────────────────────────────────────────────────────────────
  function bindEvents() {
    // Preset buttons
    document.querySelectorAll('.period-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
    });

    // Custom range
    document.getElementById('reportCustomRange')?.addEventListener('click', applyCustomRange);

    // Refresh
    document.getElementById('reportRefreshBtn')?.addEventListener('click', () => {
      if (currentStartDate && currentEndDate) {
        loadReport(currentStartDate, currentEndDate);
      }
    });

    // Enter key on date inputs
    ['reportStartDate', 'reportEndDate'].forEach(id => {
      document.getElementById(id)?.addEventListener('keydown', e => {
        if (e.key === 'Enter') applyCustomRange();
      });
    });
  }

  return {
    render,
    refresh: () => { if (currentStartDate && currentEndDate) loadReport(currentStartDate, currentEndDate); }
  };
})();
