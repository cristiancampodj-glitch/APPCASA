const router = require('express').Router();
const { query } = require('../db');
const { requireAuth } = require('../middleware');

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT a.*, u.full_name AS author_name,
              (SELECT COUNT(*) FROM announcement_likes l WHERE l.announcement_id = a.id) AS likes,
              (SELECT COUNT(*) FROM announcement_comments c WHERE c.announcement_id = a.id) AS comments,
              EXISTS(SELECT 1 FROM announcement_likes l WHERE l.announcement_id = a.id AND l.user_id = $2) AS liked
       FROM announcements a JOIN users u ON u.id = a.author_id
       WHERE a.house_id = $1
       ORDER BY a.pinned DESC, a.created_at DESC`,
      [req.user.house_id, req.user.id]
    );
    res.json({ announcements: r.rows });
  } catch (e) { next(e); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { title, body, pinned } = req.body;
    const r = await query(
      `INSERT INTO announcements (house_id, author_id, title, body, pinned)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.house_id, req.user.id, title, body, !!pinned]
    );
    res.status(201).json({ announcement: r.rows[0] });
  } catch (e) { next(e); }
});

router.post('/:id/like', requireAuth, async (req, res, next) => {
  try {
    await query(
      `INSERT INTO announcement_likes (announcement_id, user_id) VALUES ($1,$2)
       ON CONFLICT DO NOTHING`,
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:id/like', requireAuth, async (req, res, next) => {
  try {
    await query(`DELETE FROM announcement_likes WHERE announcement_id=$1 AND user_id=$2`,
      [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT c.*, u.full_name AS author_name FROM announcement_comments c
       JOIN users u ON u.id = c.user_id WHERE c.announcement_id = $1 ORDER BY c.created_at`,
      [req.params.id]
    );
    res.json({ comments: r.rows });
  } catch (e) { next(e); }
});

router.post('/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const r = await query(
      `INSERT INTO announcement_comments (announcement_id, user_id, body) VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, req.user.id, req.body.body]
    );
    res.status(201).json({ comment: r.rows[0] });
  } catch (e) { next(e); }
});

module.exports = router;
