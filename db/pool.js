'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  allowExitOnIdle: false,
});

async function connectWithRetry(retries = 5, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      console.log('[DB] Connected to PostgreSQL');
      client.release();
      return true;
    } catch (err) {
      console.error(`[DB] Connection attempt ${i + 1}/${retries} failed:`, err.message);
      if (i < retries - 1) {
        console.log(`[DB] Retrying in ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error('[DB] All connection attempts failed');
  return false;
}

const query = (text, params) => pool.query(text, params);

module.exports = { pool, query, connectWithRetry };
