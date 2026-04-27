const router = require('express').Router();
const { query } = require('../db');
const { requireAuth, requireRole, audit } = require('../middleware');
const mp = require('../services/mercadopago');
const pdf = require('../services/pdf');

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
      `SELECT p.*, u.full_name AS tenant_name
       FROM payments p
       JOIN users u ON u.id = p.tenant_id
       ${whereSql}
       ORDER BY p.period_year DESC, p.period_month DESC`,
      params
    );
    res.json({ payments: r.rows });
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
      `INSERT INTO payments (contract_id, tenant_id, house_id, period_month, period_year, amount, due_date, notes, currency)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9, (SELECT currency FROM houses WHERE id=$3), 'COP'))
       ON CONFLICT (contract_id, period_month, period_year) DO UPDATE SET amount = EXCLUDED.amount, currency = EXCLUDED.currency
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

    // Verificar que el pago exista y permisos
    const cur = await query(
      `SELECT p.*, h.owner_id FROM payments p JOIN houses h ON h.id = p.house_id WHERE p.id = $1`,
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

    const r = await query(
      `UPDATE payments SET
         status      = 'paid',
         paid_at     = NOW(),
         method      = COALESCE($2, method),
         amount_paid = COALESCE($3, amount_paid),
         reference   = COALESCE($4, reference),
         receipt_url = COALESCE($5, receipt_url),
         notes       = COALESCE($6, notes)
       WHERE id = $1 RETURNING *`,
      [req.params.id, method || null, amount_paid || p.amount, reference || null, receipt_url || null, notes || null]
    );
    audit(req, 'mark_paid', 'payments', req.params.id);
    res.json({ payment: r.rows[0] });
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
             ow.full_name AS owner_name, ow.whatsapp AS owner_phone, ow.email AS owner_email
      FROM payments p
      JOIN houses h ON h.id = p.house_id
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
    res.json({ payment: r.rows[0], house: r.rows[0] });
  } catch (e) { next(e); }
});

module.exports = router;
