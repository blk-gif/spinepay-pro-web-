'use strict';

const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Database ─────────────────────────────────────────────────────────────────
const Database = require('better-sqlite3');
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'spinepay.db');

// Ensure the database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// ── Init Schema ──────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    full_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    dob TEXT,
    gender TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    emergency_contact TEXT,
    emergency_phone TEXT,
    notes TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS insurance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    type TEXT DEFAULT 'primary',
    provider TEXT,
    policy_number TEXT,
    group_number TEXT,
    subscriber_name TEXT,
    subscriber_dob TEXT,
    subscriber_id TEXT,
    relationship TEXT,
    copay REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    duration INTEGER DEFAULT 30,
    type TEXT DEFAULT 'adjustment',
    status TEXT DEFAULT 'scheduled',
    notes TEXT,
    provider TEXT DEFAULT 'Dr. Walden Bailey',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS visit_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL,
    subjective TEXT,
    objective TEXT,
    assessment TEXT,
    plan TEXT,
    diagnosis_codes TEXT,
    procedure_codes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    appointment_id INTEGER,
    claim_number TEXT,
    insurer TEXT,
    claim_type TEXT DEFAULT 'insurance',
    amount REAL DEFAULT 0,
    paid_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    filed_date TEXT,
    service_date TEXT,
    icd_codes TEXT,
    cpt_codes TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    claim_id INTEGER,
    amount REAL NOT NULL,
    method TEXT DEFAULT 'cash',
    reference TEXT,
    date TEXT NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    type TEXT DEFAULT 'doctor',
    recipient_name TEXT,
    recipient_email TEXT,
    recipient_phone TEXT,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    sent_date TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS intake_forms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    full_name TEXT,
    dob TEXT,
    gender TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    insurance_provider TEXT,
    policy_number TEXT,
    group_number TEXT,
    medical_history TEXT,
    reason_for_visit TEXT,
    current_medications TEXT,
    allergies TEXT,
    hipaa_acknowledged INTEGER DEFAULT 0,
    signature TEXT,
    signature_date TEXT,
    submitted_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS insurance_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    insurance_id INTEGER,
    provider TEXT,
    copay REAL DEFAULT 0,
    deductible REAL DEFAULT 0,
    deductible_met REAL DEFAULT 0,
    coverage_limit REAL DEFAULT 0,
    auth_required INTEGER DEFAULT 0,
    auth_number TEXT,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    verified_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS soap_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL,
    subjective TEXT,
    objective TEXT,
    assessment TEXT,
    plan TEXT,
    diagnosis_codes TEXT,
    procedure_codes TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS eob_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_id INTEGER,
    patient_id INTEGER NOT NULL,
    insurer TEXT,
    billed_amount REAL DEFAULT 0,
    allowed_amount REAL DEFAULT 0,
    paid_amount REAL DEFAULT 0,
    patient_responsibility REAL DEFAULT 0,
    adjustment_reason TEXT,
    status TEXT DEFAULT 'received',
    received_date TEXT,
    discrepancy_flag INTEGER DEFAULT 0,
    discrepancy_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS reminder_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'sms',
    trigger_hours INTEGER DEFAULT 24,
    subject TEXT,
    body TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS reminder_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id INTEGER,
    patient_id INTEGER,
    template_id INTEGER,
    type TEXT,
    recipient TEXT,
    status TEXT DEFAULT 'sent',
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    error_message TEXT
  );
  CREATE TABLE IF NOT EXISTS waitlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    desired_date TEXT,
    desired_time TEXT,
    location_id INTEGER,
    notes TEXT,
    status TEXT DEFAULT 'waiting',
    notified_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS transportation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id INTEGER,
    patient_id INTEGER NOT NULL,
    pickup_address TEXT,
    pickup_time TEXT,
    dropoff_address TEXT,
    driver_name TEXT,
    driver_notes TEXT,
    status TEXT DEFAULT 'requested',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS pi_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    referral_id INTEGER,
    accident_date TEXT,
    accident_description TEXT,
    attorney_name TEXT,
    attorney_firm TEXT,
    attorney_phone TEXT,
    attorney_email TEXT,
    case_number TEXT,
    lien_amount REAL DEFAULT 0,
    settlement_amount REAL DEFAULT 0,
    case_status TEXT DEFAULT 'open',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS time_clock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    clock_in DATETIME NOT NULL,
    clock_out DATETIME,
    notes TEXT,
    approved INTEGER DEFAULT 0,
    approved_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Migrate existing databases ────────────────────────────────────────────────
const migrations = [
  'ALTER TABLE intake_forms ADD COLUMN full_name TEXT',
  'ALTER TABLE intake_forms ADD COLUMN dob TEXT',
  'ALTER TABLE intake_forms ADD COLUMN gender TEXT',
  'ALTER TABLE intake_forms ADD COLUMN address TEXT',
  'ALTER TABLE intake_forms ADD COLUMN phone TEXT',
  'ALTER TABLE intake_forms ADD COLUMN email TEXT',
  'ALTER TABLE intake_forms ADD COLUMN insurance_provider TEXT',
  'ALTER TABLE intake_forms ADD COLUMN policy_number TEXT',
  'ALTER TABLE intake_forms ADD COLUMN group_number TEXT',
  'ALTER TABLE intake_forms ADD COLUMN hipaa_acknowledged INTEGER DEFAULT 0',
  'ALTER TABLE intake_forms ADD COLUMN signature_date TEXT',
  'ALTER TABLE intake_forms ADD COLUMN submitted_at TEXT',
];
for (const q of migrations) {
  try { db.exec(q); } catch (_) { /* column already exists */ }
}

// Seed default data
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  db.prepare('INSERT INTO users (username, password_hash, role, full_name) VALUES (?, ?, ?, ?)').run(
    'admin', hashPassword('admin123'), 'admin', 'Administrator'
  );
}
const staffExists = db.prepare('SELECT id FROM users WHERE username = ?').get('staff');
if (!staffExists) {
  db.prepare('INSERT INTO users (username, password_hash, role, full_name) VALUES (?, ?, ?, ?)').run(
    'staff', hashPassword('staff123'), 'staff', 'Front Desk Staff'
  );
}
const locExists = db.prepare('SELECT id FROM locations WHERE name = ?').get('Walden Ave - Main Office');
if (!locExists) {
  db.prepare('INSERT INTO locations (name, address, phone) VALUES (?, ?, ?)').run(
    'Walden Ave - Main Office', '1086 Walden Ave Suite 1, Buffalo, NY 14211', '(716) 893-9200'
  );
}
const tmplCount = db.prepare('SELECT COUNT(*) as cnt FROM reminder_templates').get();
if (tmplCount.cnt === 0) {
  db.prepare('INSERT INTO reminder_templates (name, type, trigger_hours, subject, body) VALUES (?, ?, ?, ?, ?)').run(
    '24-Hour SMS Reminder', 'sms', 24, null,
    'Hi {{patient_name}}, this is a reminder of your appointment at Walden Bailey Chiropractic tomorrow at {{time}}. Reply STOP to opt out.'
  );
  db.prepare('INSERT INTO reminder_templates (name, type, trigger_hours, subject, body) VALUES (?, ?, ?, ?, ?)').run(
    '24-Hour Email Reminder', 'email', 24,
    'Appointment Reminder - Walden Bailey Chiropractic',
    'Dear {{patient_name}},\n\nThis is a friendly reminder of your appointment scheduled for {{date}} at {{time}}.\n\nLocation: 1086 Walden Ave Suite 1, Buffalo, NY 14211\nPhone: (716) 893-9200\n\nIf you need to reschedule, please call us at least 24 hours in advance.\n\nSee you soon!\nWalden Bailey Chiropractic'
  );
}

// Seed sample patients if empty
const patientCount = db.prepare('SELECT COUNT(*) as cnt FROM patients').get();
if (patientCount.cnt === 0) {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const fmt = d => d.toISOString().split('T')[0];
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const todayStr = fmt(today);
  const monStr = fmt(monday);
  const wedStr = fmt(addDays(monday, 2));
  const thuStr = fmt(addDays(monday, 3));

  const ins = db.prepare('INSERT INTO patients (first_name, last_name, dob, gender, phone, email, address, city, state, zip, emergency_contact, emergency_phone, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'active\')');
  const p1 = ins.run('James','Morrison','1985-03-15','male','716-555-0101','jmorrison@email.com','142 Elmwood Ave','Buffalo','NY','14201','Sarah Morrison','716-555-0102');
  const p2 = ins.run('Linda','Chen','1972-07-22','female','716-555-0201','lchen@email.com','89 Delaware Ave','Buffalo','NY','14202','David Chen','716-555-0202');
  const p3 = ins.run('Robert','Kowalski','1990-11-08','male','716-555-0301','rkowalski@email.com','315 Main St','Buffalo','NY','14203','Anna Kowalski','716-555-0302');
  const p4 = ins.run('Maria','Santos','1968-05-30','female','716-555-0401','msantos@email.com','77 Hertel Ave','Buffalo','NY','14207','Carlos Santos','716-555-0402');
  const p5 = ins.run('Thomas','Williams','1955-09-12','male','716-555-0501','twilliams@email.com','500 Grider St','Buffalo','NY','14215','Patricia Williams','716-555-0502');

  const insI = db.prepare('INSERT INTO insurance (patient_id, type, provider, policy_number, group_number, subscriber_name, relationship, copay) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  insI.run(p1.lastInsertRowid,'primary','BlueCross Blue Shield','BCBS-100123','GRP-5500','James Morrison','self',30);
  insI.run(p2.lastInsertRowid,'primary','Aetna','AET-200456','GRP-6600','Linda Chen','self',25);
  insI.run(p3.lastInsertRowid,'primary','UnitedHealth','UHC-300789','GRP-7700','Robert Kowalski','self',35);
  insI.run(p4.lastInsertRowid,'primary','Medicare','MC-400111','','Maria Santos','self',0);
  insI.run(p5.lastInsertRowid,'primary','Cigna','CIG-500222','GRP-8800','Thomas Williams','self',40);

  const appt = db.prepare('INSERT INTO appointments (patient_id, date, time, duration, type, status, provider) VALUES (?, ?, ?, ?, ?, ?, \'Dr. Walden Bailey\')');
  appt.run(p1.lastInsertRowid,monStr,'08:00',30,'initial-exam','completed');
  appt.run(p2.lastInsertRowid,monStr,'08:30',30,'adjustment','completed');
  appt.run(p3.lastInsertRowid,todayStr,'09:00',30,'adjustment','scheduled');
  appt.run(p4.lastInsertRowid,todayStr,'09:30',30,'follow-up','checked-in');
  appt.run(p5.lastInsertRowid,todayStr,'10:00',30,'adjustment','scheduled');
  appt.run(p1.lastInsertRowid,wedStr,'08:00',30,'adjustment','scheduled');
  appt.run(p2.lastInsertRowid,wedStr,'09:00',30,'adjustment','scheduled');
  appt.run(p3.lastInsertRowid,thuStr,'08:30',30,'follow-up','scheduled');

  const clm = db.prepare('INSERT INTO claims (patient_id, claim_number, insurer, claim_type, amount, paid_amount, status, filed_date, service_date, icd_codes, cpt_codes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  clm.run(p1.lastInsertRowid,'CLM-2024-001','BlueCross Blue Shield','insurance',350,280,'partial',fmt(addDays(today,-14)),monStr,'M54.5,M99.01','98941,98940');
  clm.run(p2.lastInsertRowid,'CLM-2024-002','Aetna','insurance',275,0,'submitted',fmt(addDays(today,-7)),monStr,'M54.2,M99.02','98940,97012');
  clm.run(p4.lastInsertRowid,'CLM-2024-003','Medicare','insurance',180,144,'paid',fmt(addDays(today,-21)),fmt(addDays(today,-21)),'M54.4','98940');

  const pay = db.prepare('INSERT INTO payments (patient_id, amount, method, reference, date, notes) VALUES (?, ?, ?, ?, ?, ?)');
  pay.run(p1.lastInsertRowid,280,'insurance','INS-PAY-001',fmt(addDays(today,-7)),'BCBS payment for CLM-2024-001');
  pay.run(p4.lastInsertRowid,144,'insurance','MC-PAY-001',fmt(addDays(today,-14)),'Medicare payment');
  pay.run(p3.lastInsertRowid,35,'cash','CASH-001',fmt(addDays(today,-3)),'Copay');

  const ref = db.prepare('INSERT INTO referrals (patient_id, type, recipient_name, recipient_email, recipient_phone, reason, status, sent_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  ref.run(p3.lastInsertRowid,'attorney','Johnson & Associates Law','info@johnsonlaw.com','716-555-9000','Motor vehicle accident injury - personal injury claim','sent',fmt(addDays(today,-5)));
  ref.run(p5.lastInsertRowid,'specialist','Dr. Patricia Nguyen, MD','pnguyen@buffaloortho.com','716-555-8000','Chronic lumbar stenosis - orthopedic evaluation needed','pending',null);
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const SQLiteStore = require('connect-sqlite3')(session);
const sessionDbPath = process.env.DATABASE_PATH
  ? path.join(path.dirname(process.env.DATABASE_PATH), 'sessions.db')
  : path.join(__dirname, 'sessions.db');

app.use(session({
  store: new SQLiteStore({ db: sessionDbPath, concurrentDB: true }),
  secret: process.env.SESSION_SECRET || 'spinepay-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000 // 8 hours
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ── Auth Routes ───────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) return res.json({ success: false, error: 'Invalid username or password' });
    if (hashPassword(password) !== user.password_hash) return res.json({ success: false, error: 'Invalid username or password' });
    const currentUser = { id: user.id, username: user.username, role: user.role, full_name: user.full_name };
    req.session.user = currentUser;
    res.json({ success: true, user: currentUser });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/auth/me', (req, res) => {
  res.json(req.session.user || null);
});

// ── Patients ──────────────────────────────────────────────────────────────────
app.get('/api/patients', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM patients ORDER BY last_name, first_name').all());
});

app.get('/api/patients/search', requireAuth, (req, res) => {
  const q = `%${req.query.q || ''}%`;
  res.json(db.prepare('SELECT * FROM patients WHERE first_name LIKE ? OR last_name LIKE ? OR phone LIKE ? OR email LIKE ? ORDER BY last_name, first_name LIMIT 20').all(q, q, q, q));
});

app.get('/api/patients/:id', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id));
});

app.post('/api/patients', requireAuth, (req, res) => {
  try {
    const data = req.body;
    const result = db.prepare('INSERT INTO patients (first_name, last_name, dob, gender, phone, email, address, city, state, zip, emergency_contact, emergency_phone, notes, status) VALUES (@first_name, @last_name, @dob, @gender, @phone, @email, @address, @city, @state, @zip, @emergency_contact, @emergency_phone, @notes, @status)').run({ ...data, status: data.status || 'active' });
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.put('/api/patients/:id', requireAuth, (req, res) => {
  try {
    db.prepare('UPDATE patients SET first_name=@first_name, last_name=@last_name, dob=@dob, gender=@gender, phone=@phone, email=@email, address=@address, city=@city, state=@state, zip=@zip, emergency_contact=@emergency_contact, emergency_phone=@emergency_phone, notes=@notes, status=@status, updated_at=CURRENT_TIMESTAMP WHERE id=@id').run({ ...req.body, id: req.params.id });
    res.json({ success: true });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.delete('/api/patients/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM patients WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/patients/import-csv', requireAuth, (req, res) => {
  try {
    const rows = req.body.rows;
    const insert = db.prepare('INSERT INTO patients (first_name, last_name, dob, gender, phone, email, address, city, state, zip, status) VALUES (@first_name, @last_name, @dob, @gender, @phone, @email, @address, @city, @state, @zip, \'active\')');
    const insertMany = db.transaction((patients) => { let c = 0; for (const p of patients) { insert.run(p); c++; } return c; });
    const count = insertMany(rows);
    res.json({ success: true, count });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

// ── Insurance ─────────────────────────────────────────────────────────────────
app.get('/api/insurance/by-patient/:patientId', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM insurance WHERE patient_id = ? ORDER BY type').all(req.params.patientId));
});

app.post('/api/insurance', requireAuth, (req, res) => {
  try {
    const result = db.prepare('INSERT INTO insurance (patient_id, type, provider, policy_number, group_number, subscriber_name, subscriber_dob, subscriber_id, relationship, copay) VALUES (@patient_id, @type, @provider, @policy_number, @group_number, @subscriber_name, @subscriber_dob, @subscriber_id, @relationship, @copay)').run(req.body);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.put('/api/insurance/:id', requireAuth, (req, res) => {
  try {
    db.prepare('UPDATE insurance SET type=@type, provider=@provider, policy_number=@policy_number, group_number=@group_number, subscriber_name=@subscriber_name, subscriber_dob=@subscriber_dob, subscriber_id=@subscriber_id, relationship=@relationship, copay=@copay WHERE id=@id').run({ ...req.body, id: req.params.id });
    res.json({ success: true });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.delete('/api/insurance/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM insurance WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Appointments ──────────────────────────────────────────────────────────────
app.get('/api/appointments', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT a.*, p.first_name, p.last_name, p.phone FROM appointments a JOIN patients p ON a.patient_id = p.id ORDER BY a.date DESC, a.time ASC').all());
});

app.get('/api/appointments/by-date', requireAuth, (req, res) => {
  const { startDate, endDate } = req.query;
  res.json(db.prepare('SELECT a.*, p.first_name, p.last_name, p.phone FROM appointments a JOIN patients p ON a.patient_id = p.id WHERE a.date BETWEEN ? AND ? ORDER BY a.date ASC, a.time ASC').all(startDate, endDate));
});

app.get('/api/appointments/by-patient/:patientId', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM appointments WHERE patient_id = ? ORDER BY date DESC, time ASC').all(req.params.patientId));
});

app.post('/api/appointments', requireAuth, (req, res) => {
  try {
    const result = db.prepare('INSERT INTO appointments (patient_id, date, time, duration, type, status, notes, provider) VALUES (@patient_id, @date, @time, @duration, @type, @status, @notes, @provider)').run({ status: 'scheduled', provider: 'Dr. Walden Bailey', ...req.body });
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.put('/api/appointments/:id', requireAuth, (req, res) => {
  try {
    db.prepare('UPDATE appointments SET patient_id=@patient_id, date=@date, time=@time, duration=@duration, type=@type, status=@status, notes=@notes, provider=@provider WHERE id=@id').run({ ...req.body, id: req.params.id });
    res.json({ success: true });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.delete('/api/appointments/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM appointments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.patch('/api/appointments/:id/status', requireAuth, (req, res) => {
  db.prepare('UPDATE appointments SET status = ? WHERE id = ?').run(req.body.status, req.params.id);
  res.json({ success: true });
});

// ── Visit Notes ───────────────────────────────────────────────────────────────
app.get('/api/visit-notes/by-appointment/:appointmentId', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM visit_notes WHERE appointment_id = ?').get(req.params.appointmentId));
});

app.post('/api/visit-notes', requireAuth, (req, res) => {
  try {
    const result = db.prepare('INSERT INTO visit_notes (appointment_id, patient_id, subjective, objective, assessment, plan, diagnosis_codes, procedure_codes) VALUES (@appointment_id, @patient_id, @subjective, @objective, @assessment, @plan, @diagnosis_codes, @procedure_codes)').run(req.body);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.put('/api/visit-notes/:id', requireAuth, (req, res) => {
  try {
    db.prepare('UPDATE visit_notes SET subjective=@subjective, objective=@objective, assessment=@assessment, plan=@plan, diagnosis_codes=@diagnosis_codes, procedure_codes=@procedure_codes WHERE id=@id').run({ ...req.body, id: req.params.id });
    res.json({ success: true });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

// ── Claims ────────────────────────────────────────────────────────────────────
app.get('/api/claims', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT c.*, p.first_name, p.last_name FROM claims c JOIN patients p ON c.patient_id = p.id ORDER BY c.created_at DESC').all());
});

app.get('/api/claims/by-patient/:patientId', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM claims WHERE patient_id = ? ORDER BY created_at DESC').all(req.params.patientId));
});

app.post('/api/claims', requireAuth, (req, res) => {
  try {
    const data = req.body;
    if (!data.claim_number) {
      data.claim_number = `CLM-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    }
    const result = db.prepare('INSERT INTO claims (patient_id, appointment_id, claim_number, insurer, claim_type, amount, paid_amount, status, filed_date, service_date, icd_codes, cpt_codes, notes) VALUES (@patient_id, @appointment_id, @claim_number, @insurer, @claim_type, @amount, @paid_amount, @status, @filed_date, @service_date, @icd_codes, @cpt_codes, @notes)').run({ appointment_id: null, paid_amount: 0, status: 'pending', ...data });
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.put('/api/claims/:id', requireAuth, (req, res) => {
  try {
    db.prepare('UPDATE claims SET patient_id=@patient_id, insurer=@insurer, claim_type=@claim_type, amount=@amount, paid_amount=@paid_amount, status=@status, filed_date=@filed_date, service_date=@service_date, icd_codes=@icd_codes, cpt_codes=@cpt_codes, notes=@notes WHERE id=@id').run({ ...req.body, id: req.params.id });
    res.json({ success: true });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.delete('/api/claims/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM claims WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.patch('/api/claims/:id/status', requireAuth, (req, res) => {
  db.prepare('UPDATE claims SET status = ? WHERE id = ?').run(req.body.status, req.params.id);
  res.json({ success: true });
});

// ── Payments ──────────────────────────────────────────────────────────────────
app.get('/api/payments', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT pay.*, p.first_name, p.last_name FROM payments pay JOIN patients p ON pay.patient_id = p.id ORDER BY pay.date DESC').all());
});

app.get('/api/payments/by-patient/:patientId', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM payments WHERE patient_id = ? ORDER BY date DESC').all(req.params.patientId));
});

app.post('/api/payments', requireAuth, (req, res) => {
  try {
    const data = req.body;
    const result = db.prepare('INSERT INTO payments (patient_id, claim_id, amount, method, reference, date, notes) VALUES (@patient_id, @claim_id, @amount, @method, @reference, @date, @notes)').run(data);
    if (data.claim_id) {
      db.prepare('UPDATE claims SET paid_amount = paid_amount + ? WHERE id = ?').run(data.amount, data.claim_id);
      const claim = db.prepare('SELECT * FROM claims WHERE id = ?').get(data.claim_id);
      if (claim) {
        let newStatus = claim.status;
        if (claim.paid_amount >= claim.amount) newStatus = 'paid';
        else if (claim.paid_amount > 0) newStatus = 'partial';
        db.prepare('UPDATE claims SET status = ? WHERE id = ?').run(newStatus, data.claim_id);
      }
    }
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

// ── Referrals ─────────────────────────────────────────────────────────────────
app.get('/api/referrals', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT r.*, p.first_name, p.last_name, p.phone, p.email FROM referrals r JOIN patients p ON r.patient_id = p.id ORDER BY r.created_at DESC').all());
});

app.get('/api/referrals/by-patient/:patientId', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM referrals WHERE patient_id = ? ORDER BY created_at DESC').all(req.params.patientId));
});

app.post('/api/referrals', requireAuth, (req, res) => {
  try {
    const result = db.prepare('INSERT INTO referrals (patient_id, type, recipient_name, recipient_email, recipient_phone, reason, status, sent_date, notes) VALUES (@patient_id, @type, @recipient_name, @recipient_email, @recipient_phone, @reason, @status, @sent_date, @notes)').run({ status: 'pending', ...req.body });
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.put('/api/referrals/:id', requireAuth, (req, res) => {
  try {
    db.prepare('UPDATE referrals SET type=@type, recipient_name=@recipient_name, recipient_email=@recipient_email, recipient_phone=@recipient_phone, reason=@reason, status=@status, sent_date=@sent_date, notes=@notes WHERE id=@id').run({ ...req.body, id: req.params.id });
    res.json({ success: true });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.delete('/api/referrals/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM referrals WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/referrals/:id/send', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  db.prepare("UPDATE referrals SET status = 'sent', sent_date = ? WHERE id = ?").run(today, req.params.id);
  res.json({ success: true });
});

// ── Reports ───────────────────────────────────────────────────────────────────
app.get('/api/reports/revenue-summary', requireAuth, (req, res) => {
  const { startDate, endDate } = req.query;
  const payments = db.prepare('SELECT SUM(amount) as total FROM payments WHERE date BETWEEN ? AND ?').get(startDate, endDate);
  const claims = db.prepare('SELECT SUM(amount) as billed, SUM(paid_amount) as collected, COUNT(*) as count FROM claims WHERE service_date BETWEEN ? AND ?').get(startDate, endDate);
  const pending = db.prepare("SELECT SUM(amount - paid_amount) as pending FROM claims WHERE status NOT IN ('paid','denied') AND service_date BETWEEN ? AND ?").get(startDate, endDate);
  res.json({ total_collected: payments.total || 0, total_billed: claims.billed || 0, total_claims_collected: claims.collected || 0, claims_count: claims.count || 0, pending_amount: pending.pending || 0 });
});

app.get('/api/reports/appointment-stats', requireAuth, (req, res) => {
  const { startDate, endDate } = req.query;
  res.json(db.prepare('SELECT status, COUNT(*) as count FROM appointments WHERE date BETWEEN ? AND ? GROUP BY status').all(startDate, endDate));
});

app.get('/api/reports/full-dashboard', requireAuth, (req, res) => {
  const { startDate, endDate } = req.query;
  const revenue = db.prepare('SELECT SUM(amount) as total FROM payments WHERE date BETWEEN ? AND ?').get(startDate, endDate);
  const claims = db.prepare("SELECT SUM(amount) as billed, SUM(paid_amount) as collected, COUNT(*) as total, SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) as paid_count, SUM(CASE WHEN status='denied' THEN 1 ELSE 0 END) as denied_count FROM claims WHERE service_date BETWEEN ? AND ?").get(startDate, endDate);
  const appts = db.prepare('SELECT status, COUNT(*) as count FROM appointments WHERE date BETWEEN ? AND ? GROUP BY status').all(startDate, endDate);
  const insurers = db.prepare('SELECT insurer, COUNT(*) as count, SUM(amount) as total FROM claims WHERE service_date BETWEEN ? AND ? GROUP BY insurer ORDER BY total DESC').all(startDate, endDate);
  const referrals = db.prepare("SELECT status, COUNT(*) as count FROM referrals WHERE date(created_at) BETWEEN ? AND ? GROUP BY status").all(startDate, endDate);
  const monthly = db.prepare("SELECT strftime('%Y-%m', date) as month, SUM(amount) as revenue FROM payments WHERE date BETWEEN ? AND ? GROUP BY month ORDER BY month").all(startDate, endDate);
  const newPatients = db.prepare('SELECT COUNT(*) as count FROM patients WHERE date(created_at) BETWEEN ? AND ?').get(startDate, endDate);
  const piCases = db.prepare('SELECT case_status, COUNT(*) as count, SUM(lien_amount) as total_lien FROM pi_cases GROUP BY case_status').all();
  res.json({ revenue: revenue.total || 0, claims, appts, insurers, referrals, monthly, newPatients: newPatients.count, piCases });
});

// ── Locations ─────────────────────────────────────────────────────────────────
app.get('/api/locations', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM locations WHERE active = 1 ORDER BY name').all());
});

app.post('/api/locations', requireAuth, (req, res) => {
  const result = db.prepare('INSERT INTO locations (name, address, phone) VALUES (@name, @address, @phone)').run(req.body);
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/api/locations/:id', requireAuth, (req, res) => {
  db.prepare('UPDATE locations SET name=@name, address=@address, phone=@phone, active=@active WHERE id=@id').run({ ...req.body, id: req.params.id });
  res.json({ success: true });
});

// ── Intake Forms ──────────────────────────────────────────────────────────────
app.get('/api/intake', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT f.*, p.first_name, p.last_name FROM intake_forms f JOIN patients p ON f.patient_id = p.id ORDER BY f.created_at DESC').all());
});

app.get('/api/intake/by-patient/:patientId', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT f.*, p.first_name, p.last_name FROM intake_forms f JOIN patients p ON f.patient_id = p.id WHERE f.patient_id = ? ORDER BY f.created_at DESC').all(req.params.patientId));
});

app.get('/api/intake/:id', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT f.*, p.first_name, p.last_name FROM intake_forms f JOIN patients p ON f.patient_id = p.id WHERE f.id = ?').get(req.params.id));
});

app.post('/api/intake', requireAuth, (req, res) => {
  try {
    const result = db.prepare('INSERT INTO intake_forms (patient_id, full_name, dob, gender, address, phone, email, insurance_provider, policy_number, group_number, medical_history, current_medications, allergies, reason_for_visit, hipaa_acknowledged, signature, signature_date, submitted_at) VALUES (@patient_id, @full_name, @dob, @gender, @address, @phone, @email, @insurance_provider, @policy_number, @group_number, @medical_history, @current_medications, @allergies, @reason_for_visit, @hipaa_acknowledged, @signature, @signature_date, @submitted_at)').run({ hipaa_acknowledged: 0, ...req.body });
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.put('/api/intake/:id', requireAuth, (req, res) => {
  try {
    db.prepare('UPDATE intake_forms SET full_name=@full_name, dob=@dob, gender=@gender, address=@address, phone=@phone, email=@email, insurance_provider=@insurance_provider, policy_number=@policy_number, group_number=@group_number, medical_history=@medical_history, current_medications=@current_medications, allergies=@allergies, reason_for_visit=@reason_for_visit, hipaa_acknowledged=@hipaa_acknowledged, signature=@signature, signature_date=@signature_date, submitted_at=@submitted_at WHERE id=@id').run({ hipaa_acknowledged: 0, ...req.body, id: req.params.id });
    res.json({ success: true });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

// ── Insurance Verification ────────────────────────────────────────────────────
app.get('/api/insverify/by-patient/:patientId', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM insurance_verifications WHERE patient_id = ? ORDER BY created_at DESC').all(req.params.patientId));
});

app.post('/api/insverify', requireAuth, (req, res) => {
  try {
    const result = db.prepare('INSERT INTO insurance_verifications (patient_id, insurance_id, provider, copay, deductible, deductible_met, coverage_limit, auth_required, auth_number, status, notes, verified_at) VALUES (@patient_id, @insurance_id, @provider, @copay, @deductible, @deductible_met, @coverage_limit, @auth_required, @auth_number, @status, @notes, @verified_at)').run({ status: 'verified', verified_at: new Date().toISOString().split('T')[0], ...req.body });
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.put('/api/insverify/:id', requireAuth, (req, res) => {
  try {
    db.prepare('UPDATE insurance_verifications SET copay=@copay, deductible=@deductible, deductible_met=@deductible_met, coverage_limit=@coverage_limit, auth_required=@auth_required, auth_number=@auth_number, status=@status, notes=@notes WHERE id=@id').run({ ...req.body, id: req.params.id });
    res.json({ success: true });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

// ── SOAP Notes ────────────────────────────────────────────────────────────────
app.get('/api/soap', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT s.*, p.first_name, p.last_name, a.date, a.time, a.type as appt_type FROM soap_notes s JOIN patients p ON s.patient_id = p.id LEFT JOIN appointments a ON s.appointment_id = a.id ORDER BY a.date DESC, s.created_at DESC').all());
});

app.get('/api/soap/by-appointment/:appointmentId', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM soap_notes WHERE appointment_id = ?').get(req.params.appointmentId));
});

app.get('/api/soap/by-patient/:patientId', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT s.*, a.date, a.time, a.type as appt_type FROM soap_notes s JOIN appointments a ON s.appointment_id = a.id WHERE s.patient_id = ? ORDER BY a.date DESC').all(req.params.patientId));
});

app.post('/api/soap', requireAuth, (req, res) => {
  try {
    const result = db.prepare('INSERT INTO soap_notes (appointment_id, patient_id, subjective, objective, assessment, plan, diagnosis_codes, procedure_codes, created_by) VALUES (@appointment_id, @patient_id, @subjective, @objective, @assessment, @plan, @diagnosis_codes, @procedure_codes, @created_by)').run({ created_by: null, ...req.body });
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.put('/api/soap/:id', requireAuth, (req, res) => {
  try {
    db.prepare('UPDATE soap_notes SET subjective=@subjective, objective=@objective, assessment=@assessment, plan=@plan, diagnosis_codes=@diagnosis_codes, procedure_codes=@procedure_codes WHERE id=@id').run({ ...req.body, id: req.params.id });
    res.json({ success: true });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.delete('/api/soap/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM soap_notes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── EOB Records ───────────────────────────────────────────────────────────────
app.get('/api/eob', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT e.*, p.first_name, p.last_name, c.claim_number FROM eob_records e JOIN patients p ON e.patient_id = p.id LEFT JOIN claims c ON e.claim_id = c.id ORDER BY e.received_date DESC, e.created_at DESC').all());
});

app.get('/api/eob/by-patient/:patientId', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM eob_records WHERE patient_id = ? ORDER BY received_date DESC').all(req.params.patientId));
});

app.delete('/api/eob/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM eob_records WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/eob', requireAuth, (req, res) => {
  try {
    const data = { claim_id: null, discrepancy_flag: 0, status: 'received', ...req.body };
    if (data.claim_id && !data.discrepancy_flag) {
      const claim = db.prepare('SELECT * FROM claims WHERE id = ?').get(data.claim_id);
      if (claim && Math.abs(claim.amount - data.billed_amount) > 0.01) {
        data.discrepancy_flag = 1;
        data.discrepancy_notes = data.discrepancy_notes || `Billed amount mismatch: claim shows $${claim.amount}, EOB shows $${data.billed_amount}`;
      }
    }
    const result = db.prepare('INSERT INTO eob_records (claim_id, patient_id, insurer, billed_amount, allowed_amount, paid_amount, patient_responsibility, adjustment_reason, status, received_date, discrepancy_flag, discrepancy_notes) VALUES (@claim_id, @patient_id, @insurer, @billed_amount, @allowed_amount, @paid_amount, @patient_responsibility, @adjustment_reason, @status, @received_date, @discrepancy_flag, @discrepancy_notes)').run(data);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.put('/api/eob/:id', requireAuth, (req, res) => {
  try {
    db.prepare('UPDATE eob_records SET allowed_amount=@allowed_amount, paid_amount=@paid_amount, patient_responsibility=@patient_responsibility, adjustment_reason=@adjustment_reason, status=@status, discrepancy_flag=@discrepancy_flag, discrepancy_notes=@discrepancy_notes WHERE id=@id').run({ ...req.body, id: req.params.id });
    res.json({ success: true });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

// ── Reminders ─────────────────────────────────────────────────────────────────
app.delete('/api/reminders/templates/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM reminder_templates WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/reminders/templates', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM reminder_templates ORDER BY type, trigger_hours').all());
});

app.post('/api/reminders/templates', requireAuth, (req, res) => {
  const result = db.prepare('INSERT INTO reminder_templates (name, type, trigger_hours, subject, body, active) VALUES (@name, @type, @trigger_hours, @subject, @body, @active)').run({ active: 1, ...req.body });
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/api/reminders/templates/:id', requireAuth, (req, res) => {
  db.prepare('UPDATE reminder_templates SET name=@name, type=@type, trigger_hours=@trigger_hours, subject=@subject, body=@body, active=@active WHERE id=@id').run({ ...req.body, id: req.params.id });
  res.json({ success: true });
});

app.get('/api/reminders/log', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT l.*, p.first_name, p.last_name FROM reminder_log l LEFT JOIN patients p ON l.patient_id = p.id ORDER BY l.sent_at DESC LIMIT 200').all());
});

app.post('/api/reminders/send', requireAuth, (req, res) => {
  try {
    const { appointmentId, templateId } = req.body;
    const appt = db.prepare('SELECT a.*, p.first_name, p.last_name, p.phone, p.email FROM appointments a JOIN patients p ON a.patient_id = p.id WHERE a.id = ?').get(appointmentId);
    const template = db.prepare('SELECT * FROM reminder_templates WHERE id = ?').get(templateId);
    if (!appt || !template) return res.json({ success: false, error: 'Not found' });
    const body = template.body
      .replace(/\{\{patient_name\}\}/g, `${appt.first_name} ${appt.last_name}`)
      .replace(/\{\{date\}\}/g, appt.date)
      .replace(/\{\{time\}\}/g, appt.time);
    db.prepare('INSERT INTO reminder_log (appointment_id, patient_id, template_id, type, recipient, status) VALUES (?, ?, ?, ?, ?, ?)').run(
      appointmentId, appt.patient_id, templateId, template.type,
      template.type === 'sms' ? appt.phone : appt.email, 'sent'
    );
    res.json({ success: true, message: body, recipient: template.type === 'sms' ? appt.phone : appt.email });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

// ── Waitlist ──────────────────────────────────────────────────────────────────
app.get('/api/waitlist', requireAuth, (req, res) => {
  res.json(db.prepare("SELECT w.*, p.first_name, p.last_name, p.phone, p.email FROM waitlist w JOIN patients p ON w.patient_id = p.id WHERE w.status = 'waiting' ORDER BY w.created_at ASC").all());
});

app.post('/api/waitlist', requireAuth, (req, res) => {
  const result = db.prepare("INSERT INTO waitlist (patient_id, desired_date, desired_time, location_id, notes, status) VALUES (@patient_id, @desired_date, @desired_time, @location_id, @notes, 'waiting')").run({ location_id: null, ...req.body });
  res.json({ success: true, id: result.lastInsertRowid });
});

app.patch('/api/waitlist/:id/status', requireAuth, (req, res) => {
  const notifiedAt = req.body.status === 'notified' ? new Date().toISOString().split('T')[0] : null;
  db.prepare('UPDATE waitlist SET status = ?, notified_at = ? WHERE id = ?').run(req.body.status, notifiedAt, req.params.id);
  res.json({ success: true });
});

app.delete('/api/waitlist/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM waitlist WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Transportation ────────────────────────────────────────────────────────────
app.get('/api/transport', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT t.*, p.first_name, p.last_name, p.phone, a.date, a.time FROM transportation t JOIN patients p ON t.patient_id = p.id LEFT JOIN appointments a ON t.appointment_id = a.id ORDER BY a.date DESC, a.time ASC').all());
});

app.get('/api/transport/by-patient/:patientId', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM transportation WHERE patient_id = ? ORDER BY created_at DESC').all(req.params.patientId));
});

app.post('/api/transport', requireAuth, (req, res) => {
  try {
    const result = db.prepare('INSERT INTO transportation (appointment_id, patient_id, pickup_address, pickup_time, dropoff_address, driver_name, driver_notes, status) VALUES (@appointment_id, @patient_id, @pickup_address, @pickup_time, @dropoff_address, @driver_name, @driver_notes, @status)').run({ status: 'requested', ...req.body });
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.put('/api/transport/:id', requireAuth, (req, res) => {
  try {
    db.prepare('UPDATE transportation SET pickup_address=@pickup_address, pickup_time=@pickup_time, dropoff_address=@dropoff_address, driver_name=@driver_name, driver_notes=@driver_notes, status=@status WHERE id=@id').run({ ...req.body, id: req.params.id });
    res.json({ success: true });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.delete('/api/transport/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM transportation WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── PI Cases ──────────────────────────────────────────────────────────────────
app.get('/api/pi', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT pi.*, p.first_name, p.last_name, p.phone FROM pi_cases pi JOIN patients p ON pi.patient_id = p.id ORDER BY pi.created_at DESC').all());
});

app.get('/api/pi/by-patient/:patientId', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM pi_cases WHERE patient_id = ? ORDER BY created_at DESC').all(req.params.patientId));
});

app.post('/api/pi', requireAuth, (req, res) => {
  try {
    const result = db.prepare('INSERT INTO pi_cases (patient_id, referral_id, accident_date, accident_description, attorney_name, attorney_firm, attorney_phone, attorney_email, case_number, lien_amount, settlement_amount, case_status, notes) VALUES (@patient_id, @referral_id, @accident_date, @accident_description, @attorney_name, @attorney_firm, @attorney_phone, @attorney_email, @case_number, @lien_amount, @settlement_amount, @case_status, @notes)').run({ referral_id: null, case_status: 'open', lien_amount: 0, settlement_amount: 0, ...req.body });
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.put('/api/pi/:id', requireAuth, (req, res) => {
  try {
    db.prepare('UPDATE pi_cases SET accident_date=@accident_date, accident_description=@accident_description, attorney_name=@attorney_name, attorney_firm=@attorney_firm, attorney_phone=@attorney_phone, attorney_email=@attorney_email, case_number=@case_number, lien_amount=@lien_amount, settlement_amount=@settlement_amount, case_status=@case_status, notes=@notes WHERE id=@id').run({ ...req.body, id: req.params.id });
    res.json({ success: true });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.delete('/api/pi/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM pi_cases WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Time Clock ────────────────────────────────────────────────────────────────
app.post('/api/timeclock/clock-in', requireAuth, (req, res) => {
  const { userId, notes } = req.body;
  const open = db.prepare('SELECT id FROM time_clock WHERE user_id = ? AND clock_out IS NULL').get(userId);
  if (open) return res.json({ success: false, error: 'Already clocked in' });
  const result = db.prepare('INSERT INTO time_clock (user_id, clock_in, notes) VALUES (?, CURRENT_TIMESTAMP, ?)').run(userId, notes || null);
  res.json({ success: true, id: result.lastInsertRowid });
});

app.post('/api/timeclock/clock-out', requireAuth, (req, res) => {
  const { userId } = req.body;
  const open = db.prepare('SELECT id FROM time_clock WHERE user_id = ? AND clock_out IS NULL').get(userId);
  if (!open) return res.json({ success: false, error: 'Not clocked in' });
  db.prepare('UPDATE time_clock SET clock_out = CURRENT_TIMESTAMP WHERE id = ?').run(open.id);
  res.json({ success: true });
});

app.get('/api/timeclock/status/:userId', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM time_clock WHERE user_id = ? AND clock_out IS NULL').get(req.params.userId));
});

app.get('/api/timeclock/entries', requireAuth, (req, res) => {
  const { userId, startDate, endDate } = req.query;
  if (userId) {
    res.json(db.prepare('SELECT t.*, u.full_name, u.username FROM time_clock t JOIN users u ON t.user_id = u.id WHERE t.user_id = ? AND date(t.clock_in) BETWEEN ? AND ? ORDER BY t.clock_in DESC').all(userId, startDate, endDate));
  } else {
    res.json(db.prepare('SELECT t.*, u.full_name, u.username FROM time_clock t JOIN users u ON t.user_id = u.id WHERE date(t.clock_in) BETWEEN ? AND ? ORDER BY t.clock_in DESC').all(startDate, endDate));
  }
});

app.patch('/api/timeclock/:id/approve', requireAuth, (req, res) => {
  db.prepare('UPDATE time_clock SET approved = 1, approved_by = ? WHERE id = ?').run(req.body.approverId, req.params.id);
  res.json({ success: true });
});

app.put('/api/timeclock/:id', requireAuth, (req, res) => {
  db.prepare('UPDATE time_clock SET clock_in=@clock_in, clock_out=@clock_out, notes=@notes WHERE id=@id').run({ ...req.body, id: req.params.id });
  res.json({ success: true });
});

app.get('/api/timeclock/users', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT id, username, full_name, role FROM users ORDER BY full_name').all());
});

// ── SPA Fallback ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));

app.listen(PORT, () => {
  console.log(`SpinePay Pro Web running on port ${PORT}`);
});
