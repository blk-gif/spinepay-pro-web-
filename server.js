'use strict';

require('dotenv').config();

const express    = require('express');
const path       = require('path');
const fs         = require('fs');
const helmet     = require('helmet');
const cors       = require('cors');
const session    = require('express-session');
const PgSession  = require('connect-pg-simple')(session);
const morgan     = require('morgan');
const bcrypt     = require('bcryptjs');
const { pool }   = require('./db/pool');
const runMigrations = require('./db/migrations');

const app  = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || true, credentials: true }));
app.use(morgan('[:date[iso]] :method :url :status :response-time ms'));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new PgSession({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'spinepay-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  name: 'spinepay.sid',
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 30 * 60 * 1000,
    sameSite: 'strict',
  },
}));

app.use((req, res, next) => {
  if (req.session && req.session.staff) {
    const now = Date.now();
    if (req.session.lastActivity && (now - req.session.lastActivity > 30 * 60 * 1000)) {
      return req.session.destroy(() => {
        res.status(401).json({ error: 'Session expired', redirect: '/login?timeout=1' });
      });
    }
    req.session.lastActivity = now;
  }
  next();
});

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', timestamp: new Date().toISOString(), database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', database: 'disconnected' });
  }
});

const { requireAuth, requireAdmin } = require('./middleware/auth');
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/patients',      requireAuth,  require('./routes/patients'));
app.use('/api/appointments',  requireAuth,  require('./routes/appointments'));
app.use('/api/soap-notes',    requireAuth,  require('./routes/soap-notes'));
app.use('/api/billing',       requireAuth,  require('./routes/billing'));
app.use('/api/staff',         requireAdmin, require('./routes/staff'));
app.use('/api/settings',      requireAdmin, require('./routes/settings'));
app.use('/api/referrals',     requireAuth,  require('./routes/referrals'));
app.use('/api/pi-cases',      requireAuth,  require('./routes/pi-cases'));
app.use('/api/intake',        requireAuth,  require('./routes/intake'));
app.use('/api/waitlist',      requireAuth,  require('./routes/waitlist'));
app.use('/api/timeclock',     requireAuth,  require('./routes/timeclock'));
app.use('/api/reminders',     requireAuth,  require('./routes/reminders'));
app.use('/api/transportation',requireAuth,  require('./routes/transportation'));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  const pageName = req.path === '/' ? 'login' : req.path.replace(/^\//, '').split('/')[0];
  const filePath = path.join(__dirname, 'public', 'pages', `${pageName}.html`);
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  res.sendFile(path.join(__dirname, 'public', 'pages', 'dashboard.html'));
});

app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  const status = err.status || 500;
  const message = status < 500 ? err.message : (process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message);
  res.status(status).json({ error: message });
});

async function start() {
  await runMigrations();
  const { rows } = await pool.query("SELECT id FROM staff WHERE role = 'Admin' LIMIT 1");
  if (rows.length === 0) {
    const hash = await bcrypt.hash('Admin1234!', 10);
    await pool.query(
      "INSERT INTO staff (first_name, last_name, username, password, role, temp_password, hipaa_signed) VALUES ('Admin', 'User', 'admin', $1, 'Admin', TRUE, FALSE) ON CONFLICT (username) DO NOTHING",
      [hash]
    );
    console.log('[Setup] Default admin created — username: admin / password: Admin1234!');
  }
  app.listen(PORT, '0.0.0.0', () => console.log('[Server] SpinePay Pro Web running on port ' + PORT));
}

start().catch(err => { console.error('[Fatal]', err.message); process.exit(1); });
