'use strict';

// Web API layer — replaces Electron's window.api (preload.js IPC bridge)
// All methods mirror the Electron API exactly, using fetch instead of IPC.

(function () {
  async function get(url) {
    const r = await fetch(url, { credentials: 'include' });
    if (r.status === 401) { sessionStorage.clear(); window.location.href = '/index.html'; throw new Error('Unauthorized'); }
    return r.json();
  }
  async function post(url, data) {
    const r = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (r.status === 401) { sessionStorage.clear(); window.location.href = '/index.html'; throw new Error('Unauthorized'); }
    return r.json();
  }
  async function put(url, data) {
    const r = await fetch(url, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (r.status === 401) { sessionStorage.clear(); window.location.href = '/index.html'; throw new Error('Unauthorized'); }
    return r.json();
  }
  async function patch(url, data) {
    const r = await fetch(url, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (r.status === 401) { sessionStorage.clear(); window.location.href = '/index.html'; throw new Error('Unauthorized'); }
    return r.json();
  }
  async function del(url) {
    const r = await fetch(url, { method: 'DELETE', credentials: 'include' });
    if (r.status === 401) { sessionStorage.clear(); window.location.href = '/index.html'; throw new Error('Unauthorized'); }
    return r.json();
  }

  window.api = {
    auth: {
      login: (credentials) => post('/api/auth/login', credentials),
      logout: () => post('/api/auth/logout'),
      getCurrentUser: () => get('/api/auth/me')
    },

    patients: {
      getAll: () => get('/api/patients'),
      getById: (id) => get(`/api/patients/${id}`),
      create: (data) => post('/api/patients', data),
      update: (id, data) => put(`/api/patients/${id}`, data),
      delete: (id) => del(`/api/patients/${id}`),
      search: (query) => get(`/api/patients/search?q=${encodeURIComponent(query)}`),
      importCsv: (rows) => post('/api/patients/import-csv', { rows })
    },

    insurance: {
      getByPatient: (patientId) => get(`/api/insurance/by-patient/${patientId}`),
      create: (data) => post('/api/insurance', data),
      update: (id, data) => put(`/api/insurance/${id}`, data),
      delete: (id) => del(`/api/insurance/${id}`)
    },

    appointments: {
      getAll: () => get('/api/appointments'),
      getByDate: (startDate, endDate) => get(`/api/appointments/by-date?startDate=${startDate}&endDate=${endDate}`),
      getByPatient: (patientId) => get(`/api/appointments/by-patient/${patientId}`),
      create: (data) => post('/api/appointments', data),
      update: (id, data) => put(`/api/appointments/${id}`, data),
      delete: (id) => del(`/api/appointments/${id}`),
      updateStatus: (id, status) => patch(`/api/appointments/${id}/status`, { status })
    },

    visitNotes: {
      getByAppointment: (appointmentId) => get(`/api/visit-notes/by-appointment/${appointmentId}`),
      create: (data) => post('/api/visit-notes', data),
      update: (id, data) => put(`/api/visit-notes/${id}`, data)
    },

    claims: {
      getAll: () => get('/api/claims'),
      getByPatient: (patientId) => get(`/api/claims/by-patient/${patientId}`),
      create: (data) => post('/api/claims', data),
      update: (id, data) => put(`/api/claims/${id}`, data),
      delete: (id) => del(`/api/claims/${id}`),
      updateStatus: (id, status) => patch(`/api/claims/${id}/status`, { status })
    },

    payments: {
      getByPatient: (patientId) => get(`/api/payments/by-patient/${patientId}`),
      getAll: () => get('/api/payments'),
      create: (data) => post('/api/payments', data)
    },

    referrals: {
      getAll: () => get('/api/referrals'),
      getByPatient: (patientId) => get(`/api/referrals/by-patient/${patientId}`),
      create: (data) => post('/api/referrals', data),
      update: (id, data) => put(`/api/referrals/${id}`, data),
      delete: (id) => del(`/api/referrals/${id}`),
      sendReferral: (id) => post(`/api/referrals/${id}/send`)
    },

    reports: {
      revenueSummary: (startDate, endDate) => get(`/api/reports/revenue-summary?startDate=${startDate}&endDate=${endDate}`),
      appointmentStats: (startDate, endDate) => get(`/api/reports/appointment-stats?startDate=${startDate}&endDate=${endDate}`),
      fullDashboard: (startDate, endDate) => get(`/api/reports/full-dashboard?startDate=${startDate}&endDate=${endDate}`)
    },

    locations: {
      getAll: () => get('/api/locations'),
      create: (data) => post('/api/locations', data),
      update: (id, data) => put(`/api/locations/${id}`, data)
    },

    intake: {
      getAll: () => get('/api/intake'),
      getByPatient: (patientId) => get(`/api/intake/by-patient/${patientId}`),
      getById: (id) => get(`/api/intake/${id}`),
      create: (data) => post('/api/intake', data),
      update: (id, data) => put(`/api/intake/${id}`, data)
    },

    insVerify: {
      getByPatient: (patientId) => get(`/api/insverify/by-patient/${patientId}`),
      create: (data) => post('/api/insverify', data),
      update: (id, data) => put(`/api/insverify/${id}`, data)
    },

    soap: {
      getAll: () => get('/api/soap'),
      getByAppointment: (appointmentId) => get(`/api/soap/by-appointment/${appointmentId}`),
      getByPatient: (patientId) => get(`/api/soap/by-patient/${patientId}`),
      create: (data) => post('/api/soap', data),
      update: (id, data) => put(`/api/soap/${id}`, data),
      delete: (id) => del(`/api/soap/${id}`)
    },

    eob: {
      getAll: () => get('/api/eob'),
      getByPatient: (patientId) => get(`/api/eob/by-patient/${patientId}`),
      create: (data) => post('/api/eob', data),
      update: (id, data) => put(`/api/eob/${id}`, data),
      delete: (id) => del(`/api/eob/${id}`)
    },

    reminders: {
      getTemplates: () => get('/api/reminders/templates'),
      createTemplate: (data) => post('/api/reminders/templates', data),
      updateTemplate: (id, data) => put(`/api/reminders/templates/${id}`, data),
      deleteTemplate: (id) => del(`/api/reminders/templates/${id}`),
      getLog: () => get('/api/reminders/log'),
      send: (appointmentId, templateId) => post('/api/reminders/send', { appointmentId, templateId })
    },

    waitlist: {
      getAll: () => get('/api/waitlist'),
      create: (data) => post('/api/waitlist', data),
      updateStatus: (id, status) => patch(`/api/waitlist/${id}/status`, { status }),
      delete: (id) => del(`/api/waitlist/${id}`)
    },

    transport: {
      getAll: () => get('/api/transport'),
      getByPatient: (patientId) => get(`/api/transport/by-patient/${patientId}`),
      create: (data) => post('/api/transport', data),
      update: (id, data) => put(`/api/transport/${id}`, data),
      delete: (id) => del(`/api/transport/${id}`)
    },

    pi: {
      getAll: () => get('/api/pi'),
      getByPatient: (patientId) => get(`/api/pi/by-patient/${patientId}`),
      create: (data) => post('/api/pi', data),
      update: (id, data) => put(`/api/pi/${id}`, data),
      delete: (id) => del(`/api/pi/${id}`)
    },

    timeclock: {
      clockIn: (userId, notes) => post('/api/timeclock/clock-in', { userId, notes }),
      clockOut: (userId) => post('/api/timeclock/clock-out', { userId }),
      getStatus: (userId) => get(`/api/timeclock/status/${userId}`),
      getEntries: (userId, startDate, endDate) => get(`/api/timeclock/entries?${userId ? `userId=${userId}&` : ''}startDate=${startDate}&endDate=${endDate}`),
      approve: (id, approverId) => patch(`/api/timeclock/${id}/approve`, { approverId }),
      update: (id, data) => put(`/api/timeclock/${id}`, data),
      getAllUsers: () => get('/api/timeclock/users')
    },

    file: {
      showOpenDialog: (options) => new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.style.display = 'none';
        document.body.appendChild(input);
        input.onchange = (e) => {
          document.body.removeChild(input);
          const file = e.target.files[0];
          if (!file) { resolve(null); return; }
          const reader = new FileReader();
          reader.onload = (ev) => resolve({ filePath: file.name, content: ev.target.result });
          reader.readAsText(file);
        };
        input.oncancel = () => { document.body.removeChild(input); resolve(null); };
        input.click();
      }),
      saveDialog: (defaultPath, content) => {
        const blob = new Blob([content], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultPath || 'export.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return Promise.resolve({ success: true });
      }
    },

    print: {
      showDialog: () => { window.print(); return Promise.resolve({ success: true }); }
    }
  };
})();
