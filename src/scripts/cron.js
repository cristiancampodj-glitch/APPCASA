/**
 * Cron diario:
 *   1) Marca pagos vencidos (overdue).
 *   2) Auto-genera el siguiente pago de arriendo de cada contrato activo
 *      cuando faltan <= 1 día para vencer el período actual (o ya venció)
 *      y todavía estamos dentro del rango del contrato.
 *   3) Envía recordatorios 5 días antes (y también al vencer) de:
 *        - pagos de arriendo
 *        - cuotas de servicios (utility_bill_shares)
 *   Programar en Railway: railway run "npm run cron" cada día.
 */
require('dotenv').config();
const { pool, query } = require('../db');
const { sendWhatsApp } = require('../services/whatsapp');

const fmtMoney = (n) => '$' + Number(n || 0).toLocaleString('es-CO');

async function step1MarkOverdue() {
  const upd = await query(
    `UPDATE payments SET status='overdue'
     WHERE status IN ('pending','partial') AND due_date < CURRENT_DATE
     RETURNING id`);
  console.log(`[cron] Pagos marcados en mora: ${upd.rows.length}`);
}

async function step2GenerateNextRentPayments() {
  // Para cada contrato activo, mirar el último período creado.
  // Si su due_date es hoy+1 o anterior, y el contrato sigue vigente, crear el siguiente mes.
  const contracts = await query(`
    SELECT c.id, c.house_id, c.tenant_id, c.monthly_rent, c.payment_day,
           c.start_date, c.end_date, h.currency, h.rent_due_day
      FROM contracts c
      JOIN houses h ON h.id = c.house_id
     WHERE c.status = 'active'
       AND (c.end_date IS NULL OR c.end_date >= CURRENT_DATE)
  `);

  let created = 0;
  for (const c of contracts.rows) {
    // Buscar el último período de este contrato
    const last = await query(
      `SELECT period_month, period_year, due_date
         FROM payments
        WHERE contract_id = $1
        ORDER BY period_year DESC, period_month DESC
        LIMIT 1`, [c.id]);

    let nextMonth, nextYear;
    if (last.rowCount === 0) {
      // No hay ningún pago aún: crear el del mes de inicio
      const start = new Date(c.start_date);
      nextMonth = start.getMonth() + 1;
      nextYear  = start.getFullYear();
    } else {
      const lastDue = new Date(last.rows[0].due_date);
      const diffDays = Math.ceil((lastDue - new Date()) / 86400000);
      // Solo generar si ya falta 1 día o menos para vencer el último
      if (diffDays > 1) continue;
      nextMonth = last.rows[0].period_month + 1;
      nextYear  = last.rows[0].period_year;
      if (nextMonth > 12) { nextMonth = 1; nextYear += 1; }
    }

    // Día de pago: contract.payment_day → houses.rent_due_day → 5
    const day = c.payment_day || c.rent_due_day || 5;
    // Ajustar si el mes no tiene ese día
    const lastDayOfMonth = new Date(nextYear, nextMonth, 0).getDate();
    const safeDay = Math.min(day, lastDayOfMonth);
    const dueDate = `${nextYear}-${String(nextMonth).padStart(2,'0')}-${String(safeDay).padStart(2,'0')}`;

    // No pasarse del fin de contrato
    if (c.end_date && new Date(dueDate) > new Date(c.end_date)) continue;

    try {
      const ins = await query(
        `INSERT INTO payments (contract_id, tenant_id, house_id, period_month, period_year, amount, base_amount, due_date, currency, status)
         VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,'pending')
         ON CONFLICT (contract_id, period_month, period_year) DO NOTHING
         RETURNING id`,
        [c.id, c.tenant_id, c.house_id, nextMonth, nextYear, c.monthly_rent, dueDate, c.currency || 'COP']
      );
      if (ins.rowCount > 0) created++;
    } catch (e) {
      console.error('[cron] Error creando próximo pago:', e.message);
    }
  }
  console.log(`[cron] Próximos pagos de arriendo creados: ${created}`);
}

async function notify(userId, type, title, body) {
  await query(
    `INSERT INTO notifications (user_id, type, title, body) VALUES ($1,$2,$3,$4)`,
    [userId, type, title, body]
  );
}

async function step3RemindRent() {
  // Recordatorio 5 días antes y también el día del vencimiento
  const upcoming = await query(`
    SELECT p.id, p.amount, p.due_date, p.currency, p.period_month, p.period_year,
           u.id AS uid, u.full_name, u.phone,
           (p.due_date - CURRENT_DATE)::int AS days_left
      FROM payments p
      JOIN users u ON u.id = p.tenant_id
     WHERE p.status IN ('pending','partial')
       AND (p.due_date - CURRENT_DATE) IN (5, 0)
  `);
  for (const p of upcoming.rows) {
    const when = p.days_left === 0 ? 'vence hoy' : `vence en ${p.days_left} días (${p.due_date})`;
    const title = p.days_left === 0 ? '⚠️ Tu arriendo vence hoy' : '🔔 Tu arriendo se aproxima a vencer';
    const body  = `Arriendo ${p.period_month}/${p.period_year} por ${fmtMoney(p.amount)} ${when}.`;
    await notify(p.uid, 'payment_due', title, body);
    if (p.phone) {
      await sendWhatsApp(p.phone,
        `🏠 Hola ${(p.full_name||'').split(' ')[0]}, tu arriendo de ${fmtMoney(p.amount)} ${when}.`);
    }
  }
  console.log(`[cron] Recordatorios de arriendo: ${upcoming.rows.length}`);
}

async function step4RemindUtilityShares() {
  // Recordatorios de cuotas de servicios (utility_bill_shares)
  const r = await query(`
    SELECT s.id, s.amount, b.due_date, b.type AS utility_type,
           u.id AS uid, u.full_name, u.phone,
           (b.due_date - CURRENT_DATE)::int AS days_left
      FROM utility_bill_shares s
      JOIN utility_bills b ON b.id = s.bill_id
      JOIN houses h ON h.id = s.house_id
      LEFT JOIN users u ON u.house_id = h.id AND u.role = 'tenant' AND u.is_active = TRUE
     WHERE s.paid = FALSE
       AND b.due_date IS NOT NULL
       AND (b.due_date - CURRENT_DATE) IN (5, 0)
  `);
  let count = 0;
  for (const s of r.rows) {
    if (!s.uid) continue;
    const when = s.days_left === 0 ? 'vence hoy' : `vence en ${s.days_left} días (${s.due_date})`;
    const title = s.days_left === 0 ? '⚠️ Recibo vence hoy' : '🔔 Tu recibo se aproxima a vencer';
    const body  = `Recibo de ${s.utility_type} por ${fmtMoney(s.amount)} ${when}.`;
    await notify(s.uid, 'utility_due', title, body);
    if (s.phone) {
      await sendWhatsApp(s.phone,
        `🧾 Hola ${(s.full_name||'').split(' ')[0]}, tu recibo de ${s.utility_type} por ${fmtMoney(s.amount)} ${when}.`);
    }
    count++;
  }
  console.log(`[cron] Recordatorios de recibos: ${count}`);
}

(async () => {
  if (require.main !== module) return;
  try {
    await step1MarkOverdue();
    await step2GenerateNextRentPayments();
    await step3RemindRent();
    await step4RemindUtilityShares();
  } catch (e) {
    console.error('[cron] Fallo:', e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();

module.exports = {
  step1MarkOverdue,
  step2GenerateNextRentPayments,
  step3RemindRent,
  step4RemindUtilityShares,
  runAll: async () => {
    await step1MarkOverdue();
    await step2GenerateNextRentPayments();
    await step3RemindRent();
    await step4RemindUtilityShares();
  }
};
