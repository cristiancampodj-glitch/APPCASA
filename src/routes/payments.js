const router = require('express').Router();
const { query } = require('../db');
const { requireAuth, requireRole, audit } = require('../middleware');
const mp = require('../services/mercadopago');
const pdf = require('../services/pdf');

// GET /api/payments
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { status, year, month } = req.query;
    const where = ['p.house_id = $1'];
    const params = [req.user.house_id];
    if (req.user.role === 'tenant') { params.push(req.user.id); where.push(`p.tenant_id = $${params.length}`); }
    if (status) { params.push(status); where.push(`p.status = $${params.length}`); }
    if (year)   { params.push(year);   where.push(`p.period_year = $${params.length}`); }
    if (month)  { params.push(month);  where.push(`p.period_month = $${params.length}`); }
    const r = await query(
      `SELECT p.*, u.full_name AS tenant_name
       FROM payments p
       JOIN users u ON u.id = p.tenant_id
       WHERE ${where.join(' AND ')}
       ORDER BY p.period_year DESC, p.period_month DESC`,
      params
    );
    res.json({ payments: r.rows });
  } catch (e) { next(e); }
});

// POST /api/payments — owner genera cobro
router.post('/', requireAuth, requireRole('owner','admin'), async (req, res, next) => {
  try {
    const { contract_id, tenant_id, period_month, period_year, amount, due_date, notes } = req.body;
    const r = await query(
      `INSERT INTO payments (contract_id, tenant_id, house_id, period_month, period_year, amount, due_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (contract_id, period_month, period_year) DO UPDATE SET amount = EXCLUDED.amount
       RETURNING *`,
      [contract_id, tenant_id, req.user.house_id, period_month, period_year, amount, due_date, notes || null]
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

// PATCH /api/payments/:id/pay — registro manual
router.patch('/:id/pay', requireAuth, requireRole('owner','admin'), async (req, res, next) => {
  try {
    const { method, amount_paid, reference } = req.body;
    const r = await query(
      `UPDATE payments SET status='paid', paid_at=NOW(), method=$2, amount_paid=$3, reference=$4
       WHERE id = $1 RETURNING *`,
      [req.params.id, method || 'transfer', amount_paid, reference || null]
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

module.exports = router;
