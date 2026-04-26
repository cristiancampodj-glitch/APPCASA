const router = require('express').Router();
const { query } = require('../db');
const { requireAuth, requireRole, audit } = require('../middleware');

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT q.*, CASE WHEN q.is_anonymous THEN 'Anónimo' ELSE u.full_name END AS author_name
       FROM pqrs q JOIN users u ON u.id = q.user_id
       WHERE q.house_id = $1 ORDER BY q.created_at DESC`,
      [req.user.house_id]
    );
    res.json({ pqrs: r.rows });
  } catch (e) { next(e); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { type, subject, body, is_anonymous } = req.body;
    const r = await query(
      `INSERT INTO pqrs (house_id, user_id, type, subject, body, is_anonymous)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.house_id, req.user.id, type, subject, body, !!is_anonymous]
    );
    audit(req, 'create_pqrs', 'pqrs', r.rows[0].id);
    res.status(201).json({ pqrs: r.rows[0] });
  } catch (e) { next(e); }
});

router.patch('/:id/respond', requireAuth, requireRole('owner','admin'), async (req, res, next) => {
  try {
    const { response, status } = req.body;
    const r = await query(
      `UPDATE pqrs SET response=$2, status=$3, responded_by=$4, responded_at=NOW()
       WHERE id=$1 RETURNING *`,
      [req.params.id, response, status || 'answered', req.user.id]
    );
    res.json({ pqrs: r.rows[0] });
  } catch (e) { next(e); }
});

module.exports = router;
