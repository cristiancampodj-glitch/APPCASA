const router = require('express').Router();
const { query } = require('../db');
const { requireAuth } = require('../middleware');

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`,
      [req.user.id]);
    res.json({ notifications: r.rows });
  } catch (e) { next(e); }
});

router.post('/:id/read', requireAuth, async (req, res, next) => {
  await query(`UPDATE notifications SET is_read=TRUE, read_at=NOW() WHERE id=$1 AND user_id=$2`,
    [req.params.id, req.user.id]);
  res.json({ ok: true });
});

router.post('/read-all', requireAuth, async (req, res, next) => {
  await query(`UPDATE notifications SET is_read=TRUE, read_at=NOW() WHERE user_id=$1 AND is_read=FALSE`,
    [req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
