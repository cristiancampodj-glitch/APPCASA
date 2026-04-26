const router = require('express').Router();
const { query } = require('../db');
const { requireAuth } = require('../middleware');

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT * FROM events WHERE house_id = $1 AND start_at >= NOW() - INTERVAL '7 days'
       ORDER BY start_at`, [req.user.house_id]);
    res.json({ events: r.rows });
  } catch (e) { next(e); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { title, description, start_at, end_at, location } = req.body;
    const r = await query(
      `INSERT INTO events (house_id, created_by, title, description, start_at, end_at, location)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.house_id, req.user.id, title, description, start_at, end_at, location]
    );
    res.status(201).json({ event: r.rows[0] });
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  await query(`DELETE FROM events WHERE id=$1 AND house_id=$2`, [req.params.id, req.user.house_id]);
  res.json({ ok: true });
});

module.exports = router;
