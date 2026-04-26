const router = require('express').Router();
const { query } = require('../db');
const { requireAuth, requireRole, audit } = require('../middleware');

// GET /api/houses/mine
router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const r = await query('SELECT * FROM houses WHERE id = $1', [req.user.house_id]);
    res.json({ house: r.rows[0] || null });
  } catch (e) { next(e); }
});

// PATCH /api/houses/:id
router.patch('/:id', requireAuth, requireRole('owner','admin'), async (req, res, next) => {
  try {
    const { name, address, city, country, monthly_rent, currency, rules } = req.body;
    const r = await query(
      `UPDATE houses SET
        name = COALESCE($2, name),
        address = COALESCE($3, address),
        city = COALESCE($4, city),
        country = COALESCE($5, country),
        monthly_rent = COALESCE($6, monthly_rent),
        currency = COALESCE($7, currency),
        rules = COALESCE($8, rules)
       WHERE id = $1 RETURNING *`,
      [req.params.id, name, address, city, country, monthly_rent, currency, rules]
    );
    audit(req, 'update_house', 'houses', req.params.id);
    res.json({ house: r.rows[0] });
  } catch (e) { next(e); }
});

// POST /api/houses — multi-casa
router.post('/', requireAuth, requireRole('owner','admin'), async (req, res, next) => {
  try {
    const { name, address, city, country, monthly_rent, currency } = req.body;
    const r = await query(
      `INSERT INTO houses (name, address, city, country, monthly_rent, currency)
       VALUES ($1,$2,$3,COALESCE($4,'CO'),$5,COALESCE($6,'COP')) RETURNING *`,
      [name, address, city, country, monthly_rent || 0, (currency || '').toUpperCase() || null]
    );
    audit(req, 'create_house', 'houses', r.rows[0].id);
    res.status(201).json({ house: r.rows[0] });
  } catch (e) { next(e); }
});

module.exports = router;
