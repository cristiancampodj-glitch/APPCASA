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

module.exports = router;
