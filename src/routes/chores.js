const router = require('express').Router();
const { query } = require('../db');
const { requireAuth, audit } = require('../middleware');

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT c.*, u.full_name AS assignee_name
       FROM chores c LEFT JOIN users u ON u.id = c.assigned_to
       WHERE c.house_id = $1 AND c.due_date >= CURRENT_DATE - INTERVAL '30 days'
       ORDER BY c.due_date ASC`,
      [req.user.house_id]
    );
    res.json({ chores: r.rows });
  } catch (e) { next(e); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { type, title, description, assigned_to, due_date } = req.body;
    const r = await query(
      `INSERT INTO chores (house_id, assigned_to, type, title, description, due_date)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.house_id, assigned_to || null, type, title, description, due_date]
    );
    audit(req, 'create_chore', 'chores', r.rows[0].id);
    res.status(201).json({ chore: r.rows[0] });
  } catch (e) { next(e); }
});

router.patch('/:id/complete', requireAuth, async (req, res, next) => {
  try {
    const { proof_url } = req.body;
    const r = await query(
      `UPDATE chores SET status='done', completed_at=NOW(), completed_by=$2, proof_url=$3
       WHERE id=$1 RETURNING *`,
      [req.params.id, req.user.id, proof_url || null]
    );
    res.json({ chore: r.rows[0] });
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    await query('DELETE FROM chores WHERE id=$1 AND house_id=$2', [req.params.id, req.user.house_id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
