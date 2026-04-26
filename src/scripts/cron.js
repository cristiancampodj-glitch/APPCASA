/**
 * Cron: marca pagos vencidos, envía recordatorios WhatsApp y crea notificaciones.
 * Programar en Railway: railway run "npm run cron" cada día (Cron Job).
 */
require('dotenv').config();
const { pool, query } = require('../db');
const { sendWhatsApp } = require('../services/whatsapp');

(async () => {
  // 1. Marca vencidos
  const upd = await query(
    `UPDATE payments SET status='overdue'
     WHERE status IN ('pending','partial') AND due_date < CURRENT_DATE
     RETURNING id, tenant_id, amount, due_date`);
  console.log(`Pagos vencidos marcados: ${upd.rows.length}`);

  // 2. Notificación interna + WhatsApp 3 días antes y al vencer
  const upcoming = await query(`
    SELECT p.id, p.amount, p.due_date, u.id AS uid, u.full_name, u.phone
    FROM payments p JOIN users u ON u.id = p.tenant_id
    WHERE p.status IN ('pending','partial')
      AND p.due_date IN (CURRENT_DATE + 3, CURRENT_DATE)
  `);
  for (const p of upcoming.rows) {
    await query(
      `INSERT INTO notifications (user_id, type, title, body) VALUES ($1,$2,$3,$4)`,
      [p.uid, 'payment_due',
        `Pago de arriendo próximo`,
        `Tienes un pago de $${Number(p.amount).toLocaleString('es-CO')} con vencimiento ${p.due_date}.`]
    );
    if (p.phone) {
      await sendWhatsApp(p.phone,
        `🏠 Hola ${p.full_name.split(' ')[0]}, te recordamos tu arriendo de $${Number(p.amount).toLocaleString('es-CO')} con vencimiento ${p.due_date}.`);
    }
  }

  await pool.end();
})();
