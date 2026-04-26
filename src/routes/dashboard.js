const router = require('express').Router();
const { query } = require('../db');
const { requireAuth } = require('../middleware');

// GET /api/dashboard — KPIs principales
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const hid = req.user.house_id;
    const houseRow = await query(`SELECT currency FROM houses WHERE id=$1`, [hid]);
    const currency = houseRow.rows[0]?.currency || 'COP';
    const [income, overdue, occupants, damages, chores, expenses] = await Promise.all([
      query(`SELECT COALESCE(SUM(amount_paid),0)::float AS total FROM payments
             WHERE house_id=$1 AND status='paid' AND paid_at >= date_trunc('year', NOW())`, [hid]),
      query(`SELECT COUNT(*)::int AS c, COALESCE(SUM(amount-amount_paid),0)::float AS amt
             FROM payments WHERE house_id=$1 AND status IN ('overdue','pending','partial') AND due_date < CURRENT_DATE`, [hid]),
      query(`SELECT COUNT(*)::int AS c FROM users WHERE house_id=$1 AND is_active`, [hid]),
      query(`SELECT COUNT(*)::int AS c FROM damages WHERE house_id=$1 AND status IN ('reported','in_progress')`, [hid]),
      query(`SELECT COUNT(*)::int AS c FROM chores WHERE house_id=$1 AND status='pending' AND due_date <= CURRENT_DATE + 7`, [hid]),
      query(`SELECT COALESCE(SUM(amount),0)::float AS total FROM expenses WHERE house_id=$1 AND expense_date >= date_trunc('month',NOW())`, [hid])
    ]);

    // Serie mensual (últimos 12 meses)
    const monthly = await query(`
      SELECT to_char(d, 'YYYY-MM') AS month,
             COALESCE(SUM(p.amount_paid) FILTER (WHERE p.status='paid'),0)::float AS income,
             COALESCE(SUM(e.amount),0)::float AS expense
      FROM generate_series(date_trunc('month', NOW()) - INTERVAL '11 months', date_trunc('month',NOW()), '1 month') d
      LEFT JOIN payments p ON p.house_id=$1 AND date_trunc('month',p.paid_at)=d
      LEFT JOIN expenses e ON e.house_id=$1 AND date_trunc('month',e.expense_date::timestamptz)=d
      GROUP BY d ORDER BY d
    `, [hid]);

    res.json({
      currency,
      kpis: {
        income_year: income.rows[0].total,
        overdue_count: overdue.rows[0].c,
        overdue_amount: overdue.rows[0].amt,
        occupants: occupants.rows[0].c,
        active_damages: damages.rows[0].c,
        pending_chores: chores.rows[0].c,
        expenses_month: expenses.rows[0].total
      },
      monthly: monthly.rows
    });
  } catch (e) { next(e); }
});

router.get('/tenant-scores', requireAuth, async (req, res, next) => {
  try {
    const r = await query(`SELECT * FROM v_tenant_scores ORDER BY score DESC`);
    res.json({ scores: r.rows });
  } catch (e) { next(e); }
});

module.exports = router;
