const router = require('express').Router();
const { query } = require('../db');
const { requireAuth } = require('../middleware');

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT e.*, u.full_name AS payer_name,
              (SELECT json_agg(s.*) FROM expense_splits s WHERE s.expense_id = e.id) AS splits
       FROM expenses e JOIN users u ON u.id = e.paid_by
       WHERE e.house_id = $1 ORDER BY e.expense_date DESC`,
      [req.user.house_id]);
    res.json({ expenses: r.rows });
  } catch (e) { next(e); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { title, amount, category, expense_date, splits = [] } = req.body;
    const e = await query(
      `INSERT INTO expenses (house_id, paid_by, title, amount, category, expense_date)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.house_id, req.user.id, title, amount, category, expense_date || new Date()]
    );
    for (const s of splits) {
      await query(
        `INSERT INTO expense_splits (expense_id, user_id, amount_owed) VALUES ($1,$2,$3)`,
        [e.rows[0].id, s.user_id, s.amount_owed]
      );
    }
    res.status(201).json({ expense: e.rows[0] });
  } catch (err) { next(err); }
});

router.patch('/splits/:id/pay', requireAuth, async (req, res, next) => {
  try {
    const r = await query(
      `UPDATE expense_splits SET is_paid=TRUE, paid_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *`,
      [req.params.id, req.user.id]
    );
    res.json({ split: r.rows[0] });
  } catch (e) { next(e); }
});

// Balance neto por usuario
router.get('/balance', requireAuth, async (req, res, next) => {
  try {
    const r = await query(`
      WITH paid AS (
        SELECT paid_by AS user_id, SUM(amount) AS pagado FROM expenses WHERE house_id=$1 GROUP BY paid_by
      ), owes AS (
        SELECT s.user_id, SUM(s.amount_owed) AS debe
        FROM expense_splits s JOIN expenses e ON e.id = s.expense_id
        WHERE e.house_id=$1 AND s.is_paid = FALSE GROUP BY s.user_id
      )
      SELECT u.id, u.full_name,
             COALESCE(p.pagado,0) - COALESCE(o.debe,0) AS balance
      FROM users u LEFT JOIN paid p ON p.user_id = u.id LEFT JOIN owes o ON o.user_id = u.id
      WHERE u.house_id = $1
    `, [req.user.house_id]);
    res.json({ balances: r.rows });
  } catch (e) { next(e); }
});

module.exports = router;
