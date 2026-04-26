const router = require('express').Router();
const { query } = require('../db');
const { requireAuth } = require('../middleware');

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const r = await query(`SELECT * FROM inventory WHERE house_id = $1 ORDER BY name`, [req.user.house_id]);
    res.json({ items: r.rows });
  } catch (e) { next(e); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, quantity, unit, min_stock } = req.body;
    const r = await query(
      `INSERT INTO inventory (house_id, name, quantity, unit, min_stock) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.house_id, name, quantity || 0, unit || 'unidad', min_stock || 1]
    );
    res.status(201).json({ item: r.rows[0] });
  } catch (e) { next(e); }
});

router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const { quantity, name, min_stock } = req.body;
    const r = await query(
      `UPDATE inventory SET
        quantity = COALESCE($2, quantity),
        name = COALESCE($3, name),
        min_stock = COALESCE($4, min_stock),
        last_bought_by = $5, last_bought_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id, quantity, name, min_stock, req.user.id]
    );
    res.json({ item: r.rows[0] });
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  await query(`DELETE FROM inventory WHERE id=$1 AND house_id=$2`, [req.params.id, req.user.house_id]);
  res.json({ ok: true });
});

module.exports = router;
