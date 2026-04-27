const router = require('express').Router();
const { query } = require('../db');
const { hash } = require('../auth');
const { requireAuth, requireRole, audit, invalidateUserCache } = require('../middleware');

// Helper: ¿el owner es dueño de la casa del usuario target?
async function ownerOwnsUser(ownerId, targetUserId) {
  const r = await query(
    `SELECT 1 FROM users u
       JOIN houses h ON h.id = u.house_id
      WHERE u.id = $1 AND h.owner_id = $2 LIMIT 1`,
    [targetUserId, ownerId]
  );
  return r.rowCount > 0;
}

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
    const isSelf = req.user.id === id;
    const isAdmin = ['owner','admin'].includes(req.user.role);
    if (!isSelf && !isAdmin) return res.status(403).json({ error: 'Sin permisos' });
    if (!isSelf && isAdmin && !(await ownerOwnsUser(req.user.id, id))) {
      return res.status(403).json({ error: 'Ese usuario no pertenece a tus propiedades' });
    }

    const { full_name, phone, avatar_url, theme, locale, push_token, email, password } = req.body;

    // Solo owner/admin (sobre su propio inquilino) puede cambiar email/password de otro
    let password_hash = null;
    if (password && password.length >= 6) {
      if (!isSelf && !isAdmin) return res.status(403).json({ error: 'Sin permisos para cambiar contraseña' });
      password_hash = await hash(password);
    }
    let newEmail = null;
    if (email) {
      if (!isSelf && !isAdmin) return res.status(403).json({ error: 'Sin permisos para cambiar correo' });
      newEmail = String(email).trim().toLowerCase();
    }

    const r = await query(
      `UPDATE users SET
        full_name     = COALESCE($2, full_name),
        phone         = COALESCE($3, phone),
        avatar_url    = COALESCE($4, avatar_url),
        theme         = COALESCE($5, theme),
        locale        = COALESCE($6, locale),
        push_token    = COALESCE($7, push_token),
        email         = COALESCE($8, email),
        password_hash = COALESCE($9, password_hash)
       WHERE id = $1 RETURNING id, full_name, email, phone, role, theme, locale`,
      [id, full_name, phone, avatar_url, theme, locale, push_token, newEmail, password_hash]
    );
    if (password_hash) audit(req, 'reset_password', 'users', id);
    if (newEmail) audit(req, 'update_email', 'users', id);
    invalidateUserCache(id);
    res.json({ user: r.rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ese correo ya está en uso' });
    next(e);
  }
});

// POST /api/users/:id/end-contract — owner termina contrato del inquilino
router.post('/:id/end-contract', requireAuth, requireRole('owner','admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!(await ownerOwnsUser(req.user.id, id))) {
      return res.status(403).json({ error: 'Ese usuario no pertenece a tus propiedades' });
    }
    // Marca contratos activos como finalizados, desasigna y desactiva al usuario
    await query(`UPDATE contracts SET status = 'finished', end_date = CURRENT_DATE
                  WHERE tenant_id = $1 AND status = 'active'`, [id]);
    await query(`UPDATE users SET is_active = FALSE, house_id = NULL WHERE id = $1`, [id]);
    audit(req, 'end_contract', 'users', id);
    invalidateUserCache(id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// DELETE /api/users/:id
router.delete('/:id', requireAuth, requireRole('owner','admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!(await ownerOwnsUser(req.user.id, id))) {
      return res.status(403).json({ error: 'Ese usuario no pertenece a tus propiedades' });
    }
    await query('UPDATE users SET is_active = FALSE WHERE id = $1', [id]);
    audit(req, 'deactivate_user', 'users', id);
    invalidateUserCache(id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
