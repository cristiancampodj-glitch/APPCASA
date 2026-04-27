const router = require('express').Router();
const { query } = require('../db');
const { requireAuth, requireRole } = require('../middleware');

// Panel superadmin
router.get('/stats', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const [houses, users, payments, mrr] = await Promise.all([
      query(`SELECT COUNT(*)::int AS c FROM houses`),
      query(`SELECT COUNT(*)::int AS c FROM users`),
      query(`SELECT COUNT(*)::int AS c, COALESCE(SUM(amount_paid),0)::float AS total FROM payments WHERE status='paid'`),
      query(`SELECT COALESCE(SUM(p.monthly_price),0)::float AS mrr
             FROM subscriptions s JOIN plans p ON p.id = s.plan_id
             WHERE s.status='active'`)
    ]);
    res.json({
      houses: houses.rows[0].c,
      users: users.rows[0].c,
      payments_count: payments.rows[0].c,
      payments_total: payments.rows[0].total,
      mrr: mrr.rows[0].mrr
    });
  } catch (e) { next(e); }
});

router.get('/audit', requireAuth, requireRole('admin','owner'), async (req, res, next) => {
  try {
    const r = await query(
      `SELECT a.*, u.full_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.house_id = $1 OR $2 = 'admin'
       ORDER BY a.created_at DESC LIMIT 200`,
      [req.user.house_id, req.user.role]);
    res.json({ logs: r.rows });
  } catch (e) { next(e); }
});

// GET /api/admin/integrity — listar inconsistencias casa-inquilino
router.get('/integrity', requireAuth, requireRole('admin','owner'), async (req, res, next) => {
  try {
    const payments = await query(
      `SELECT p.id, p.house_id AS payment_house, u.house_id AS tenant_house,
              u.full_name AS tenant_name, p.amount, p.period_month, p.period_year
       FROM payments p
       JOIN users u ON u.id = p.tenant_id
       WHERE p.house_id <> u.house_id`
    );
    const contracts = await query(
      `SELECT c.id, c.house_id AS contract_house, u.house_id AS tenant_house,
              u.full_name AS tenant_name
       FROM contracts c
       JOIN users u ON u.id = c.tenant_id
       WHERE c.house_id <> u.house_id`
    );
    res.json({
      payments_mismatch: payments.rows,
      contracts_mismatch: contracts.rows
    });
  } catch (e) { next(e); }
});

// POST /api/admin/integrity/fix — repara los pagos/contratos mal asignados
router.post('/integrity/fix', requireAuth, requireRole('admin','owner'), async (req, res, next) => {
  try {
    const p = await query(
      `UPDATE payments p
       SET house_id = u.house_id
       FROM users u
       WHERE p.tenant_id = u.id AND p.house_id <> u.house_id
       RETURNING p.id`
    );
    const c = await query(
      `UPDATE contracts c
       SET house_id = u.house_id
       FROM users u
       WHERE c.tenant_id = u.id AND c.house_id <> u.house_id
       RETURNING c.id`
    );
    res.json({
      payments_fixed: p.rowCount,
      contracts_fixed: c.rowCount
    });
  } catch (e) { next(e); }
});

module.exports = router;
