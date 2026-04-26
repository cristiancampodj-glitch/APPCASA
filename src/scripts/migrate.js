/**
 * Ejecuta los SQL de /db en orden alfabético.
 * Uso: npm run migrate
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

(async () => {
  const dir = path.join(__dirname, '..', '..', 'db');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    console.log('▶', f);
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    try {
      await pool.query(sql);
      console.log('  ✓');
    } catch (e) {
      console.error('  ✗', e.message);
    }
  }
  await pool.end();
  console.log('Listo');
})();
