const router = require('express').Router();
const { query } = require('../db');
const { requireAuth, requireRole } = require('../middleware');

// Áreas comunes
router.get('/areas', requireAuth, async (req, res, next) => {
  try {
    const r = await query(`SELECT * FROM common_areas WHERE house_id=$1 AND is_active`, [req.user.house_id]);
    res.json({ areas: r.rows });
  } catch (e) { next(e); }
});

router.post('/areas', requireAuth, requireRole('owner','admin'), async (req, res, next) => {
  try {
    const { name, description, capacity, rules } = req.body;
    const r = await query(
      `INSERT INTO common_areas (house_id, name, description, capacity, rules)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.house_id, name, description, capacity || 1, rules]
    );
    res.status(201).json({ area: r.rows[0] });
  } catch (e) { next(e); }
});

// Reservas
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT b.*, a.name AS area_name, u.full_name AS user_name
       FROM bookings b JOIN common_areas a ON a.id = b.area_id JOIN users u ON u.id = b.user_id
       WHERE b.house_id=$1 AND b.end_at >= NOW() - INTERVAL '7 days'
       ORDER BY b.start_at`, [req.user.house_id]);
    res.json({ bookings: r.rows });
  } catch (e) { next(e); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { area_id, start_at, end_at, notes } = req.body;
    // Verifica conflicto
    const c = await query(
      `SELECT 1 FROM bookings WHERE area_id=$1 AND status IN ('confirmed','pending')
       AND tstzrange(start_at, end_at) && tstzrange($2::timestamptz, $3::timestamptz)`,
      [area_id, start_at, end_at]
    );
    if (c.rows[0]) return res.status(409).json({ error: 'Horario ocupado' });
    const r = await query(
      `INSERT INTO bookings (area_id, user_id, house_id, start_at, end_at, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [area_id, req.user.id, req.user.house_id, start_at, end_at, notes]
    );
    res.status(201).json({ booking: r.rows[0] });
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  await query(`UPDATE bookings SET status='cancelled' WHERE id=$1 AND user_id=$2`,
    [req.params.id, req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
