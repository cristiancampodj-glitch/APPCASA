const router = require('express').Router();
const { query } = require('../db');
const { requireAuth } = require('../middleware');

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT p.*, u.full_name AS author_name,
        (SELECT json_agg(json_build_object(
            'id',o.id,'label',o.label,
            'votes',(SELECT COUNT(*) FROM poll_votes v WHERE v.option_id=o.id)
         ) ORDER BY o.sort_order) FROM poll_options o WHERE o.poll_id = p.id) AS options,
        (SELECT option_id FROM poll_votes v WHERE v.poll_id=p.id AND v.user_id=$2) AS my_vote
       FROM polls p JOIN users u ON u.id = p.created_by
       WHERE p.house_id=$1 ORDER BY p.created_at DESC`,
      [req.user.house_id, req.user.id]);
    res.json({ polls: r.rows });
  } catch (e) { next(e); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { question, description, options = [], closes_at, is_anonymous } = req.body;
    if (options.length < 2) return res.status(400).json({ error: 'Mínimo 2 opciones' });
    const p = await query(
      `INSERT INTO polls (house_id, created_by, question, description, closes_at, is_anonymous)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.house_id, req.user.id, question, description, closes_at, !!is_anonymous]
    );
    let i = 0;
    for (const label of options) {
      await query(`INSERT INTO poll_options (poll_id, label, sort_order) VALUES ($1,$2,$3)`,
        [p.rows[0].id, label, i++]);
    }
    res.status(201).json({ poll: p.rows[0] });
  } catch (e) { next(e); }
});

router.post('/:id/vote', requireAuth, async (req, res, next) => {
  try {
    const { option_id } = req.body;
    await query(
      `INSERT INTO poll_votes (poll_id, option_id, user_id) VALUES ($1,$2,$3)
       ON CONFLICT (poll_id, user_id) DO UPDATE SET option_id = EXCLUDED.option_id`,
      [req.params.id, option_id, req.user.id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.patch('/:id/close', requireAuth, async (req, res, next) => {
  await query(`UPDATE polls SET status='closed' WHERE id=$1 AND created_by=$2`,
    [req.params.id, req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
