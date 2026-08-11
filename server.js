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
const { pool, connectWithRetry } = require('./db/pool');
const runMigrations = require('./db/migrations');

const app  = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || true, credentials: true }));
app.use(morgan('[:date[iso]] :method :url :status :response-time ms'));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
// Redirect old SPA entry point to new standalone dashboard
app.get('/app.html', (req, res) => res.redirect('/dashboard'));

app.use(express.static(path.join(__dirname, 'public')));

// When CloudFront forwards requests, it sets X-CF-Secure: true on HTTPS connections.
// EB's nginx overwrites X-Forwarded-Proto before it reaches Express, so we use this
// custom header as the authoritative signal that the original request was HTTPS.
// express-session 1.19.0 does not support cookie.secure as a function, so we set
// req.secure manually here before the session middleware reads it.
app.use((req, res, next) => {
  if (req.get('X-CF-Secure') === 'true') req.secure = true;
  next();
});

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

// ── Core routes ─────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/patients',      requireAuth,  require('./routes/patients'));
app.use('/api/appointments',  requireAuth,  require('./routes/appointments'));
app.use('/api/staff',         requireAdmin, require('./routes/staff'));
app.use('/api/settings',      requireAdmin, require('./routes/settings'));
app.use('/api/waitlist',      requireAuth,  require('./routes/waitlist'));
app.use('/api/reminders',     requireAuth,  require('./routes/reminders'));

// ── Clinical routes (with frontend-expected path aliases) ───────────────────
app.use('/api/soap-notes',    requireAuth,  require('./routes/soap-notes'));
app.use('/api/soap',          requireAuth,  require('./routes/soap-notes'));  // alias

app.use('/api/intake',        requireAuth,  require('./routes/intake'));

// ── Billing routes (frontend calls /api/claims, /api/payments, /api/eob) ───
app.use('/api/claims',        requireAuth,  require('./routes/claims'));
app.use('/api/payments',      requireAuth,  require('./routes/payments'));
app.use('/api/eob',           requireAuth,  require('./routes/eob'));
app.use('/api/billing',       requireAuth,  require('./routes/billing'));  // keep for compat

// ── Operations (frontend calls /api/transport, /api/pi) ─────────────────────
app.use('/api/transportation',requireAuth,  require('./routes/transportation'));
app.use('/api/transport',     requireAuth,  require('./routes/transportation'));  // alias

app.use('/api/pi-cases',      requireAuth,  require('./routes/pi-cases'));
app.use('/api/pi',            requireAuth,  require('./routes/pi-cases'));  // alias

app.use('/api/referrals',     requireAuth,  require('./routes/referrals'));
app.use('/api/timeclock',     requireAuth,  require('./routes/timeclock'));

// ── Reports ──────────────────────────────────────────────────────────────────
app.use('/api/reports',       requireAuth,  require('./routes/reports'));
app.use('/api/documents',     requireAuth,  require('./routes/documents'));
app.use('/api/backup',        requireAdmin, require('./routes/backup'));
app.use('/webhooks',                        require('./routes/webhooks'));

// Serve local document uploads (S3 fallback)
app.use('/uploads', requireAuth, express.static(path.join(__dirname, 'uploads')));

app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  // Handle /settings, /settings.html, and /pages/settings.html all the same way
  let page = req.path.replace(/\.html$/, '').replace(/^\//, '');
  if (page.startsWith('pages/')) page = page.replace('pages/', '');
  if (!page || page === '') page = 'login';
  const filePath = path.join(__dirname, 'public', 'pages', `${page}.html`);
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  res.sendFile(path.join(__dirname, 'public', 'pages', 'login.html'));
});

app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  const status = err.status || 500;
  const message = status < 500 ? err.message : (process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message);
  res.status(status).json({ error: message });
});

async function createDefaultAdmin() {
  const { rows } = await pool.query("SELECT id FROM staff WHERE role = 'Admin' LIMIT 1");
  if (rows.length === 0) {
    const hash = await bcrypt.hash('Admin1234!', 10);
    await pool.query(
      "INSERT INTO staff (first_name, last_name, username, password, role, temp_password, hipaa_signed) VALUES ('Admin', 'User', 'admin', $1, 'Admin', TRUE, FALSE) ON CONFLICT (username) DO NOTHING",
      [hash]
    );
    console.log('[Setup] Default admin created — username: admin / password: Admin1234!');
  }
}

async function start() {
  console.log('[Server] Starting...');

  const connected = await connectWithRetry(5, 3000);
  if (!connected) {
    console.error('[Server] Could not connect to database after 5 attempts');
    process.exit(1);
  }

  await runMigrations();
  await createDefaultAdmin();

  app.listen(PORT, '0.0.0.0', () => {
    console.log('[Server] SpinePay Pro Web running on port ' + PORT);
    if (process.env.NODE_ENV === 'production') {
      const { startBackupSchedule } = require('./services/backup');
      const { startReviewSchedule } = require('./services/reviews');
      startBackupSchedule();
      startReviewSchedule();
    }
  });
}

start().catch(err => { console.error('[Fatal]', err.message); process.exit(1); });
