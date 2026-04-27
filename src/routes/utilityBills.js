const router = require('express').Router();
const { query } = require('../db');
const { requireAuth, requireRole, audit } = require('../middleware');

// Helpers
function round2(n) { return Math.round(Number(n) * 100) / 100; }

// GET /api/utility-bills — owner: ve sus recibos; tenant: ve solo los que afectan su casa
router.get('/', requireAuth, async (req, res, next) => {
  try {
    let r;
    if (req.user.role === 'tenant') {
      r = await query(
        `SELECT b.*,
                json_agg(json_build_object(
                  'id', s.id, 'house_id', s.house_id, 'amount', s.amount,
                  'paid', s.paid, 'paid_at', s.paid_at, 'notes', s.notes,
                  'house_name', h.name
                ) ORDER BY h.name) AS shares
         FROM utility_bills b
         JOIN utility_bill_shares s ON s.bill_id = b.id
         JOIN houses h ON h.id = s.house_id
         WHERE s.house_id = $1
         GROUP BY b.id
         ORDER BY b.period_year DESC, b.period_month DESC, b.created_at DESC`,
        [req.user.house_id]
      );
    } else {
      r = await query(
        `SELECT b.*,
                json_agg(json_build_object(
                  'id', s.id, 'house_id', s.house_id, 'amount', s.amount,
                  'paid', s.paid, 'paid_at', s.paid_at, 'notes', s.notes,
                  'house_name', h.name
                ) ORDER BY h.name) AS shares
         FROM utility_bills b
         LEFT JOIN utility_bill_shares s ON s.bill_id = b.id
         LEFT JOIN houses h ON h.id = s.house_id
         WHERE b.owner_id = $1 OR $2 = 'admin'
         GROUP BY b.id
         ORDER BY b.period_year DESC, b.period_month DESC, b.created_at DESC`,
        [req.user.id, req.user.role]
      );
    }
    res.json({ bills: r.rows });
  } catch (e) { next(e); }
});

/**
 * POST /api/utility-bills — owner crea recibo y lo divide
 * body: {
 *   type, period_month, period_year, total_amount,
 *   due_date?, bill_url?, notes?,
 *   split: 'equal' | 'custom',
 *   shares: [{ house_id, amount? }]   // amount obligatorio si split='custom'
 * }
 */
router.post('/', requireAuth, requireRole('owner','admin'), async (req, res, next) => {
  try {
    const {
      type, period_month, period_year, total_amount,
      due_date, bill_url, notes, split = 'equal', shares = []
    } = req.body;

    if (!type || !period_month || !period_year || !total_amount) {
      return res.status(400).json({ error: 'Faltan: type, period_month, period_year, total_amount' });
    }
    if (!Array.isArray(shares) || shares.length === 0) {
      return res.status(400).json({ error: 'Debes seleccionar al menos una propiedad' });
    }

    // Verificar permiso sobre todas las casas (deben pertenecer al owner)
    const houseIds = [...new Set(shares.map(s => s.house_id).filter(Boolean))];
    if (houseIds.length === 0) return res.status(400).json({ error: 'Casas inválidas' });

    if (req.user.role !== 'admin') {
      const ck = await query(
        `SELECT id FROM houses WHERE id = ANY($1::uuid[]) AND (owner_id = $2 OR owner_id IS NULL)`,
        [houseIds, req.user.id]
      );
      if (ck.rows.length !== houseIds.length) {
        return res.status(403).json({ error: 'No tienes permiso sobre alguna de esas casas' });
      }
    }

    // Calcular montos
    const total = Number(total_amount);
    let computed = [];
    if (split === 'equal') {
      const per = round2(total / houseIds.length);
      computed = houseIds.map((id, i) => ({
        house_id: id,
        // último ajusta para que sume exacto
        amount: i === houseIds.length - 1
          ? round2(total - per * (houseIds.length - 1))
          : per
      }));
    } else {
      computed = shares.map(s => ({ house_id: s.house_id, amount: round2(s.amount) }));
      const sum = computed.reduce((a, b) => a + Number(b.amount), 0);
      if (Math.abs(sum - total) > 0.01) {
        return res.status(400).json({ error: `La suma (${sum}) no coincide con el total (${total})` });
      }
    }

    // Insert bill + shares
    const bill = await query(
      `INSERT INTO utility_bills
         (owner_id, type, period_month, period_year, total_amount, due_date, bill_url, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id, type, period_month, period_year, total, due_date || null, bill_url || null, notes || null]
    );

    for (const s of computed) {
      await query(
        `INSERT INTO utility_bill_shares (bill_id, house_id, amount)
         VALUES ($1,$2,$3)
         ON CONFLICT (bill_id, house_id) DO UPDATE SET amount = EXCLUDED.amount`,
        [bill.rows[0].id, s.house_id, s.amount]
      );
    }

    audit(req, 'create_utility_bill', 'utility_bills', bill.rows[0].id);
    res.status(201).json({ bill: bill.rows[0], shares: computed });
  } catch (e) { next(e); }
});

// PATCH /api/utility-bills/shares/:id/pay — marcar parte pagada
router.patch('/shares/:id/pay', requireAuth, async (req, res, next) => {
  try {
    // Si es tenant, debe ser de su casa
    const ck = await query(
      `SELECT s.*, b.owner_id FROM utility_bill_shares s
       JOIN utility_bills b ON b.id = s.bill_id WHERE s.id = $1`,
      [req.params.id]
    );
    const sh = ck.rows[0];
    if (!sh) return res.status(404).json({ error: 'No existe' });

    if (req.user.role === 'tenant' && sh.house_id !== req.user.house_id) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    if (req.user.role === 'owner' && sh.owner_id && sh.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const r = await query(
      `UPDATE utility_bill_shares SET paid = TRUE, paid_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    audit(req, 'pay_utility_share', 'utility_bill_shares', r.rows[0].id);
    res.json({ share: r.rows[0] });
  } catch (e) { next(e); }
});

// DELETE /api/utility-bills/:id
router.delete('/:id', requireAuth, requireRole('owner','admin'), async (req, res, next) => {
  try {
    const ck = await query('SELECT owner_id FROM utility_bills WHERE id = $1', [req.params.id]);
    if (!ck.rows[0]) return res.status(404).json({ error: 'No existe' });
    if (req.user.role !== 'admin' && ck.rows[0].owner_id && ck.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    await query('DELETE FROM utility_bills WHERE id = $1', [req.params.id]);
    audit(req, 'delete_utility_bill', 'utility_bills', req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
