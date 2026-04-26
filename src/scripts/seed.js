/**
 * Crea un dueño + casa + inquilino demo con contraseñas reales.
 * Uso: ADMIN_EMAIL=tu@mail.com ADMIN_PASS=secreto123 npm run seed
 */
require('dotenv').config();
const { pool, query } = require('../db');
const { hash } = require('../auth');

(async () => {
  const email = process.env.ADMIN_EMAIL || 'admin@casa.com';
  const pass  = process.env.ADMIN_PASS  || 'admin123';
  try {
    const h = await query(
      `INSERT INTO houses (name, address, city, monthly_rent)
       VALUES ('Casa Principal','Calle 123 #45-67','Bogotá',1500000)
       ON CONFLICT DO NOTHING RETURNING id`);
    const house_id = h.rows[0]?.id || (await query(`SELECT id FROM houses LIMIT 1`)).rows[0].id;
    const ph = await hash(pass);
    await query(
      `INSERT INTO users (house_id, full_name, email, password_hash, role)
       VALUES ($1,'Administrador',$2,$3,'owner')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role='owner'`,
      [house_id, email, ph]
    );
    console.log(`✓ Owner: ${email} / ${pass}`);
  } catch (e) { console.error(e); }
  await pool.end();
})();
