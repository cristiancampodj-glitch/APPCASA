const router = require('express').Router();
const { query } = require('../db');
const { hash } = require('../auth');
const { requireAuth, requireRole, audit } = require('../middleware');

// GET /api/users — usuarios de mi casa
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT id, full_name, email, phone, role, avatar_url, is_active, last_login, created_at
       FROM users WHERE house_id = $1 ORDER BY created_at DESC`,
      [req.user.house_id]
    );
    res.json({ users: r.rows });
  } catch (e) { next(e); }
});

// POST /api/users — owner crea inquilino
router.post('/', requireAuth, requireRole('owner','admin'), async (req, res, next) => {
  try {
    const { full_name, email, phone, password, role = 'tenant' } = req.body;
    const h = await hash(password || 'cambiar123');
    const r = await query(
      `INSERT INTO users (house_id, full_name, email, phone, password_hash, role)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, full_name, email, role`,
      [req.user.house_id, full_name, email, phone || null, h, role]
    );
    audit(req, 'create_user', 'users', r.rows[0].id);
    res.status(201).json({ user: r.rows[0] });
  } catch (e) { next(e); }
});

// PATCH /api/users/:id
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (req.user.id !== id && !['owner','admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Sin permisos' });
    }
    const { full_name, phone, avatar_url, theme, locale, push_token } = req.body;
    const r = await query(
      `UPDATE users SET
        full_name  = COALESCE($2, full_name),
        phone      = COALESCE($3, phone),
        avatar_url = COALESCE($4, avatar_url),
        theme      = COALESCE($5, theme),
        locale     = COALESCE($6, locale),
        push_token = COALESCE($7, push_token)
       WHERE id = $1 RETURNING id, full_name, email, role, theme, locale`,
      [id, full_name, phone, avatar_url, theme, locale, push_token]
    );
    res.json({ user: r.rows[0] });
  } catch (e) { next(e); }
});

// DELETE /api/users/:id
router.delete('/:id', requireAuth, requireRole('owner','admin'), async (req, res, next) => {
  try {
    await query('UPDATE users SET is_active = FALSE WHERE id = $1 AND house_id = $2',
      [req.params.id, req.user.house_id]);
    audit(req, 'deactivate_user', 'users', req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
