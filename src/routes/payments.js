const router = require('express').Router();
const { query } = require('../db');
const { requireAuth, requireRole, audit } = require('../middleware');
const mp = require('../services/mercadopago');
const pdf = require('../services/pdf');

// ---------- Cálculo de intereses de mora ------------------------------
// Reglas:
//  - Hay un período de gracia (contracts.grace_days, def. 3 días).
//  - Si days_late <= grace_days → no hay interés.
//  - Si days_late > grace_days  → interés sobre `base_amount` desde el día
//    siguiente al fin de la gracia. Tasa mensual (def. 2%) prorrateada por días.
//
// Devuelve { days_late, late_fee, current_amount } redondeados.
function calcLateFee({ base_amount, due_date, grace_days, monthly_rate, asOf = new Date() }) {
  const base = Number(base_amount) || 0;
  const grace = Number(grace_days ?? 3);
  const rate = Number(monthly_rate ?? 0.02);
  if (!due_date || base <= 0) return { days_late: 0, late_fee: 0, current_amount: base };
  const due = new Date(due_date);
  // Normalizar a UTC midnight
  const dayMs = 24 * 60 * 60 * 1000;
  const dueUTC = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const nowUTC = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  const days_late = Math.max(0, Math.floor((nowUTC - dueUTC) / dayMs));
  const billable = Math.max(0, days_late - grace);
  const late_fee = billable > 0 ? Math.round((base * rate * billable) / 30) : 0;
  return { days_late, late_fee, current_amount: base + late_fee };
}

// Decora un payment con late_fee/current_amount calculados al vuelo
function decoratePayment(p) {
  if (!p) return p;
  if (p.status === 'paid' || p.status === 'cancelled') {
    p.current_amount = Number(p.amount);
    p.days_late = p.days_late || 0;
    p.late_fee = Number(p.late_fee || 0);
    return p;
  }
  const calc = calcLateFee({
    base_amount: p.base_amount || p.amount,
    due_date: p.due_date,
    grace_days: p.grace_days,
    monthly_rate: p.late_fee_monthly_rate
  });
  p.days_late = calc.days_late;
  p.late_fee_preview = calc.late_fee;
  p.current_amount = calc.current_amount;
  return p;
}

// GET /api/payments
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { status, year, month, house_id } = req.query;
    const where = [];
    const params = [];
    if (req.user.role === 'tenant') {
      params.push(req.user.house_id); where.push(`p.house_id = $${params.length}`);
      params.push(req.user.id);        where.push(`p.tenant_id = $${params.length}`);
    } else if (req.user.role === 'owner') {
      // Dueño: ve pagos de TODAS sus casas (owner_id) o de su casa principal si owner_id es null
      params.push(req.user.id);
      params.push(req.user.house_id);
      where.push(`(EXISTS (SELECT 1 FROM houses h WHERE h.id = p.house_id AND h.owner_id = $${params.length - 1}) OR p.house_id = $${params.length})`);
    }
    if (house_id) { params.push(house_id); where.push(`p.house_id = $${params.length}`); }
    if (status)   { params.push(status);   where.push(`p.status = $${params.length}`); }
    if (year)     { params.push(year);     where.push(`p.period_year = $${params.length}`); }
    if (month)    { params.push(month);    where.push(`p.period_month = $${params.length}`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const r = await query(
      `SELECT p.*, u.full_name AS tenant_name,
              c.grace_days, c.late_fee_monthly_rate
       FROM payments p
       JOIN users u ON u.id = p.tenant_id
       LEFT JOIN contracts c ON c.id = p.contract_id
       ${whereSql}
       ORDER BY p.period_year DESC, p.period_month DESC`,
      params
    );
    res.json({ payments: r.rows.map(decoratePayment) });
  } catch (e) { next(e); }
});

// POST /api/payments — owner genera cobro
router.post('/', requireAuth, requireRole('owner','admin'), async (req, res, next) => {
  try {
    const { tenant_id, period_month, period_year, amount, due_date, notes, currency } = req.body;
    let { contract_id } = req.body;
    const cur = (currency || '').toUpperCase() || null; // null deja al trigger heredar de la casa

    // Resolver house_id desde el inquilino (no desde req.user.house_id, que es la casa "principal" del dueño)
    const t = await query('SELECT id, house_id FROM users WHERE id = $1 AND role = $2', [tenant_id, 'tenant']);
    if (!t.rows[0] || !t.rows[0].house_id) {
      return res.status(400).json({ error: 'Inquilino inválido o sin casa asignada' });
    }
    const house_id = t.rows[0].house_id;

    // Validar que el dueño tenga acceso a esa casa (owner_id) o sea admin
    if (req.user.role !== 'admin') {
      const h = await query('SELECT owner_id FROM houses WHERE id = $1', [house_id]);
      if (!h.rows[0] || (h.rows[0].owner_id && h.rows[0].owner_id !== req.user.id)) {
        return res.status(403).json({ error: 'No tienes permiso sobre esta casa' });
      }
    }

    // Validar contract_id si vino, o resolver/crear el contrato a partir de house+tenant
    if (contract_id) {
      const c = await query(
        'SELECT id FROM contracts WHERE id = $1 AND house_id = $2 AND tenant_id = $3',
        [contract_id, house_id, tenant_id]
      );
      if (!c.rows[0]) contract_id = null;
    }
    if (!contract_id) {
      const existing = await query(
        `SELECT id FROM contracts
         WHERE house_id = $1 AND tenant_id = $2 AND status = 'active'
         ORDER BY created_at DESC LIMIT 1`,
        [house_id, tenant_id]
      );
      if (existing.rows[0]) {
        contract_id = existing.rows[0].id;
      } else {
        const h = await query('SELECT monthly_rent, rent_due_day FROM houses WHERE id = $1', [house_id]);
        const monthlyRent = Number(h.rows[0]?.monthly_rent) || Number(amount) || 0;
        const paymentDay = h.rows[0]?.rent_due_day || 5;
        const startDate = due_date || new Date().toISOString().slice(0, 10);
        const created = await query(
          `INSERT INTO contracts (house_id, tenant_id, start_date, monthly_rent, payment_day, status)
           VALUES ($1, $2, $3, $4, $5, 'active')
           RETURNING id`,
          [house_id, tenant_id, startDate, monthlyRent, paymentDay]
        );
        contract_id = created.rows[0].id;
      }
    }

    const r = await query(
      `INSERT INTO payments (contract_id, tenant_id, house_id, period_month, period_year, amount, base_amount, due_date, notes, currency)
       VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,COALESCE($9, (SELECT currency FROM houses WHERE id=$3), 'COP'))
       ON CONFLICT (contract_id, period_month, period_year) DO UPDATE SET amount = EXCLUDED.amount, base_amount = EXCLUDED.base_amount, currency = EXCLUDED.currency
       RETURNING *`,
      [contract_id, tenant_id, house_id, period_month, period_year, amount, due_date, notes || null, cur]
    );
    audit(req, 'create_payment', 'payments', r.rows[0].id);
    res.status(201).json({ payment: r.rows[0] });
  } catch (e) { next(e); }
});

// POST /api/payments/:id/checkout — crea link de Mercado Pago
router.post('/:id/checkout', requireAuth, async (req, res, next) => {
  try {
    const r = await query('SELECT * FROM payments WHERE id = $1', [req.params.id]);
    const p = r.rows[0];
    if (!p) return res.status(404).json({ error: 'No existe' });
    const link = await mp.createPreference({
      title: `Arriendo ${p.period_month}/${p.period_year}`,
      amount: Number(p.amount),
      currency: p.currency || 'COP',
      external_reference: p.id,
      payer_email: req.user.email
    });
    await query(
      `UPDATE payments SET gateway = 'mercadopago', gateway_link = $2 WHERE id = $1`,
      [p.id, link]
    );
    res.json({ checkout_url: link });
  } catch (e) { next(e); }
});

// PATCH /api/payments/:id/pay — el dueño confirma pago, o el inquilino sube comprobante
router.patch('/:id/pay', requireAuth, async (req, res, next) => {
  try {
    const { method, amount_paid, reference, receipt_url, notes } = req.body;

    // Verificar que el pago exista y permisos (incluyendo datos del contrato para mora)
    const cur = await query(
      `SELECT p.*, h.owner_id,
              c.grace_days, c.late_fee_monthly_rate, c.id AS contract_pk
         FROM payments p
         JOIN houses h    ON h.id = p.house_id
         LEFT JOIN contracts c ON c.id = p.contract_id
        WHERE p.id = $1`,
      [req.params.id]
    );
    const p = cur.rows[0];
    if (!p) return res.status(404).json({ error: 'Pago no encontrado' });

    if (req.user.role === 'tenant' && p.tenant_id !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    if (req.user.role === 'owner' && p.owner_id && p.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    // Limitar tamaño del comprobante si viene como dataURL
    if (receipt_url && receipt_url.length > 8_000_000) {
      return res.status(413).json({ error: 'Comprobante demasiado grande (máx ~6MB)' });
    }

    // ---- Cálculo de intereses de mora -----------------------------------
    const baseAmount = Number(p.base_amount || p.amount);
    const calc = calcLateFee({
      base_amount: baseAmount,
      due_date: p.due_date,
      grace_days: p.grace_days,
      monthly_rate: p.late_fee_monthly_rate
    });
    const finalAmount = baseAmount + calc.late_fee;

    const r = await query(
      `UPDATE payments SET
         status      = 'paid',
         paid_at     = NOW(),
         method      = COALESCE($2, method),
         amount      = $7,
         base_amount = $8,
         late_fee    = $9,
         days_late   = $10,
         amount_paid = COALESCE($3, $7),
         reference   = COALESCE($4, reference),
         receipt_url = COALESCE($5, receipt_url),
         notes       = COALESCE($6, notes)
       WHERE id = $1 RETURNING *`,
      [
        req.params.id,
        method || null,
        amount_paid || null,
        reference || null,
        receipt_url || null,
        notes || null,
        finalAmount,
        baseAmount,
        calc.late_fee,
        calc.days_late
      ]
    );

    // ---- Castigo persistente: subir el canon del contrato ---------------
    // Si hubo intereses, el nuevo canon mensual queda fijo en el monto pagado.
    if (calc.late_fee > 0 && p.contract_pk) {
      await query(
        `UPDATE contracts SET monthly_rent = $2 WHERE id = $1 AND monthly_rent < $2`,
        [p.contract_pk, finalAmount]
      );
    }

    audit(req, 'mark_paid', 'payments', req.params.id, {
      late_fee: calc.late_fee, days_late: calc.days_late
    });
    res.json({ payment: decoratePayment(r.rows[0]) });
  } catch (e) { next(e); }
});

// GET /api/payments/:id/receipt.pdf
router.get('/:id/receipt.pdf', requireAuth, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT p.*, u.full_name AS tenant_name, u.email AS tenant_email, h.name AS house_name, h.address
       FROM payments p
       JOIN users u ON u.id = p.tenant_id
       JOIN houses h ON h.id = p.house_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    const p = r.rows[0];
    if (!p) return res.status(404).end();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="recibo-${p.id}.pdf"`);
    await pdf.generateReceipt(res, p);
  } catch (e) { next(e); }
});

// GET /api/payments/next — para el inquilino: próximo pago + datos bancarios del dueño
router.get('/next', requireAuth, async (req, res, next) => {
  try {
    const r = await query(`
      SELECT p.*, h.bank_info, h.owner_whatsapp, h.name AS house_name, h.currency AS house_currency,
             c.grace_days, c.late_fee_monthly_rate,
             ow.full_name AS owner_name, ow.whatsapp AS owner_phone, ow.email AS owner_email
      FROM payments p
      JOIN houses h ON h.id = p.house_id
      LEFT JOIN contracts c ON c.id = p.contract_id
      LEFT JOIN users ow ON ow.id = h.owner_id
      WHERE p.tenant_id = $1 AND p.status IN ('pending','overdue','partial')
      ORDER BY p.due_date ASC LIMIT 1
    `, [req.user.id]);

    // Si no hay pendientes, traer último pagado para mostrar histórico
    if (!r.rows[0]) {
      const last = await query(`
        SELECT p.*, h.bank_info, h.owner_whatsapp, h.name AS house_name,
               ow.full_name AS owner_name, ow.whatsapp AS owner_phone
        FROM payments p
        JOIN houses h ON h.id = p.house_id
        LEFT JOIN users ow ON ow.id = h.owner_id
        WHERE p.tenant_id = $1
        ORDER BY p.paid_at DESC NULLS LAST, p.due_date DESC LIMIT 1
      `, [req.user.id]);
      // O datos del dueño si no hay pagos aún
      if (!last.rows[0]) {
        const h = await query(`
          SELECT h.bank_info, h.owner_whatsapp, h.name AS house_name,
                 ow.full_name AS owner_name, ow.whatsapp AS owner_phone
          FROM houses h LEFT JOIN users ow ON ow.id = h.owner_id
          WHERE h.id = $1
        `, [req.user.house_id]);
        return res.json({ payment: null, house: h.rows[0] || null });
      }
      return res.json({ payment: null, last_paid: last.rows[0], house: last.rows[0] });
    }
    res.json({ payment: decoratePayment(r.rows[0]), house: r.rows[0] });
  } catch (e) { next(e); }
});

module.exports = router;
