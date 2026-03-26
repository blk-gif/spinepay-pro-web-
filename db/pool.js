'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.connect((err, client, release) => {
  if (err) { console.error('[DB] Connection failed:', err.message); process.exit(1); }
  release();
  console.log('[DB] PostgreSQL connected');
});

const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
