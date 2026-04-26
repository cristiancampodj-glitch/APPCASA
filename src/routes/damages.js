const router = require('express').Router();
const { query } = require('../db');
const { requireAuth, audit } = require('../middleware');

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT d.*, u.full_name AS reporter_name,
              (SELECT json_agg(p.*) FROM damage_photos p WHERE p.damage_id = d.id) AS photos
       FROM damages d
       JOIN users u ON u.id = d.reported_by
       WHERE d.house_id = $1
       ORDER BY d.created_at DESC`, [req.user.house_id]);
    res.json({ damages: r.rows });
  } catch (e) { next(e); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { title, description, location, priority, estimated_cost, photos = [], photo_url } = req.body;
    const r = await query(
      `INSERT INTO damages (house_id, reported_by, title, description, location, priority, estimated_cost, photo_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.house_id, req.user.id, title, description, location, priority || 'medium', estimated_cost, photo_url || null]
    );
    for (const url of photos) {
      await query(`INSERT INTO damage_photos (damage_id, url, uploaded_by) VALUES ($1,$2,$3)`,
        [r.rows[0].id, url, req.user.id]);
    }
    audit(req, 'create_damage', 'damages', r.rows[0].id);
    res.status(201).json({ damage: r.rows[0] });
  } catch (e) { next(e); }
});

router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const { status, final_cost } = req.body;
    const r = await query(
      `UPDATE damages SET
         status = COALESCE($2, status),
         final_cost = COALESCE($3, final_cost),
         resolved_at = CASE WHEN $2 = 'resolved' THEN NOW() ELSE resolved_at END,
         resolved_by = CASE WHEN $2 = 'resolved' THEN $4 ELSE resolved_by END
       WHERE id = $1 RETURNING *`,
      [req.params.id, status, final_cost, req.user.id]
    );
    res.json({ damage: r.rows[0] });
  } catch (e) { next(e); }
});

module.exports = router;
