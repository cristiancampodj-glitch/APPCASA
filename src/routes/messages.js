const router = require('express').Router();
const { query } = require('../db');
const { requireAuth } = require('../middleware');

// GET /api/messages?to=user_id (o sin to = chat de la casa)
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { to } = req.query;
    let r;
    if (to) {
      r = await query(
        `SELECT m.*, u.full_name AS from_name FROM messages m JOIN users u ON u.id = m.from_user
         WHERE m.house_id = $1 AND
           ((m.from_user = $2 AND m.to_user = $3) OR (m.from_user = $3 AND m.to_user = $2))
         ORDER BY m.created_at ASC LIMIT 200`,
        [req.user.house_id, req.user.id, to]
      );
    } else {
      r = await query(
        `SELECT m.*, u.full_name AS from_name FROM messages m JOIN users u ON u.id = m.from_user
         WHERE m.house_id = $1 AND m.to_user IS NULL ORDER BY m.created_at DESC LIMIT 100`,
        [req.user.house_id]
      );
    }
    res.json({ messages: r.rows });
  } catch (e) { next(e); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { to, body } = req.body;
    const r = await query(
      `INSERT INTO messages (house_id, from_user, to_user, body) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.house_id, req.user.id, to || null, body]
    );
    res.status(201).json({ message: r.rows[0] });
  } catch (e) { next(e); }
});

module.exports = router;
