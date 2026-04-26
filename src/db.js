const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.warn('[db] DATABASE_URL no definida — la API responderá pero las queries fallarán.');
}

const pool = new Pool({
  connectionString,
  ssl: connectionString && connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000
});

pool.on('error', (e) => console.error('[pg pool]', e));

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  if (process.env.LOG_SQL) console.log('[sql]', (Date.now() - start) + 'ms', text.slice(0, 80));
  return res;
}

module.exports = { pool, query };
