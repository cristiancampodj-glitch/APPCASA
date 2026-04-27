const router = require('express').Router();
const { query } = require('../db');
const { requireAuth, requireRole, audit, invalidateUserCache } = require('../middleware');
const cronJobs = require('../scripts/cron');

// Panel superadmin
router.get('/stats', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const [houses, users, payments, mrr] = await Promise.all([
      query(`SELECT COUNT(*)::int AS c FROM houses`),
      query(`SELECT COUNT(*)::int AS c FROM users`),
      query(`SELECT COUNT(*)::int AS c, COALESCE(SUM(amount_paid),0)::float AS total FROM payments WHERE status='paid'`),
      query(`SELECT COALESCE(SUM(p.monthly_price),0)::float AS mrr
             FROM subscriptions s JOIN plans p ON p.id = s.plan_id
             WHERE s.status='active'`)
    ]);
    res.json({
      houses: houses.rows[0].c,
      users: users.rows[0].c,
      payments_count: payments.rows[0].c,
      payments_total: payments.rows[0].total,
      mrr: mrr.rows[0].mrr
    });
  } catch (e) { next(e); }
});

router.get('/audit', requireAuth, requireRole('admin','owner'), async (req, res, next) => {
  try {
    const r = await query(
      `SELECT a.*, u.full_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.house_id = $1 OR $2 = 'admin'
       ORDER BY a.created_at DESC LIMIT 200`,
      [req.user.house_id, req.user.role]);
    res.json({ logs: r.rows });
  } catch (e) { next(e); }
});

// GET /api/admin/integrity — listar inconsistencias casa-inquilino
router.get('/integrity', requireAuth, requireRole('admin','owner'), async (req, res, next) => {
  try {
    const payments = await query(
      `SELECT p.id, p.house_id AS payment_house, u.house_id AS tenant_house,
              u.full_name AS tenant_name, p.amount, p.period_month, p.period_year
       FROM payments p
       JOIN users u ON u.id = p.tenant_id
       WHERE p.house_id <> u.house_id`
    );
    const contracts = await query(
      `SELECT c.id, c.house_id AS contract_house, u.house_id AS tenant_house,
              u.full_name AS tenant_name
       FROM contracts c
       JOIN users u ON u.id = c.tenant_id
       WHERE c.house_id <> u.house_id`
    );
    res.json({
      payments_mismatch: payments.rows,
      contracts_mismatch: contracts.rows
    });
  } catch (e) { next(e); }
});

// POST /api/admin/integrity/fix — repara los pagos/contratos mal asignados
router.post('/integrity/fix', requireAuth, requireRole('admin','owner'), async (req, res, next) => {
  try {
    const p = await query(
      `UPDATE payments p
       SET house_id = u.house_id
       FROM users u
       WHERE p.tenant_id = u.id AND p.house_id <> u.house_id
       RETURNING p.id`
    );
    const c = await query(
      `UPDATE contracts c
       SET house_id = u.house_id
       FROM users u
       WHERE c.tenant_id = u.id AND c.house_id <> u.house_id
       RETURNING c.id`
    );
    res.json({
      payments_fixed: p.rowCount,
      contracts_fixed: c.rowCount
    });
  } catch (e) { next(e); }
});

// POST /api/admin/run-cron — ejecuta tareas programadas manualmente
router.post('/run-cron', requireAuth, requireRole('admin','owner'), async (req, res, next) => {
  try {
    await cronJobs.runAll();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// =====================================================================
//   GESTIÓN DE USUARIOS (solo admin) — aprobaciones, dueños, inquilinos
// =====================================================================

// GET /api/admin/users?status=pending|approved|inactive|all&role=owner|tenant&q=...
router.get('/users', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { status = 'all', role, q } = req.query;
    const where = [];
    const params = [];
    if (status === 'pending')  where.push('approved IS NOT TRUE');
    if (status === 'approved') where.push('approved IS TRUE AND is_active IS TRUE');
    if (status === 'inactive') where.push('is_active IS FALSE');
    if (role) { params.push(role); where.push(`role = $${params.length}`); }
    if (q)    { params.push(`%${q}%`); where.push(`(full_name ILIKE $${params.length} OR email ILIKE $${params.length})`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const r = await query(
      `SELECT id, full_name, email, phone, role, requested_role, is_active, approved,
              approved_at, approved_by, approval_notes,
              pending_house_name, pending_currency, house_id,
              national_id, last_login, created_at
         FROM users
         ${whereSql}
         ORDER BY (approved IS NOT TRUE) DESC, created_at DESC
         LIMIT 500`,
      params
    );
    res.json({ users: r.rows });
  } catch (e) { next(e); }
});

// GET /api/admin/users/stats
router.get('/users/stats', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const r = await query(`
      SELECT
        COUNT(*) FILTER (WHERE approved IS NOT TRUE)::int AS pending,
        COUNT(*) FILTER (WHERE approved IS TRUE AND is_active IS TRUE)::int AS approved,
        COUNT(*) FILTER (WHERE is_active IS FALSE)::int AS inactive,
        COUNT(*) FILTER (WHERE role = 'owner' AND approved IS TRUE)::int AS owners,
        COUNT(*) FILTER (WHERE role = 'tenant' AND approved IS TRUE)::int AS tenants,
        COUNT(*)::int AS total
      FROM users
    `);
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// POST /api/admin/users/:id/approve
// Body opcional: { role, house_name, currency, notes }
router.post('/users/:id/approve', requireAuth, requireRole('admin'), async (req, res, next) => {
  const { id } = req.params;
  const { role: newRole, house_name, currency, notes } = req.body || {};
  try {
    const r = await query('SELECT * FROM users WHERE id = $1', [id]);
    const u = r.rows[0];
    if (!u) return res.status(404).json({ error: 'Usuario no existe' });
    if (u.approved === true) return res.status(409).json({ error: 'Esta cuenta ya está aprobada' });

    const finalRole = (newRole === 'owner' || newRole === 'tenant' || newRole === 'admin')
      ? newRole
      : (u.requested_role || u.role || 'tenant');

    let house_id = u.house_id;

    // Si será dueño y aún no tiene propiedad, créala
    if (finalRole === 'owner' && !house_id) {
      const name = house_name || u.pending_house_name || `Propiedad de ${u.full_name}`;
      const cur  = ((currency || u.pending_currency || 'COP') + '').toUpperCase();
      const h = await query(
        `INSERT INTO houses (name, currency) VALUES ($1, $2) RETURNING id`,
        [name, cur]
      );
      house_id = h.rows[0].id;
      await query(`UPDATE houses SET owner_id = $1 WHERE id = $2`, [u.id, house_id]);
    }

    await query(
      `UPDATE users SET
         approved        = TRUE,
         is_active       = TRUE,
         approved_at     = NOW(),
         approved_by     = $2,
         approval_notes  = COALESCE($3, approval_notes),
         role            = $4,
         house_id        = $5,
         pending_house_name = NULL,
         pending_currency   = NULL
       WHERE id = $1`,
      [id, req.user.id, notes || null, finalRole, house_id]
    );
    invalidateUserCache(id);
    audit(req, 'approve_user', 'users', id, { role: finalRole, house_id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/admin/users/:id/reject — rechazar registro
router.post('/users/:id/reject', requireAuth, requireRole('admin'), async (req, res, next) => {
  const { id } = req.params;
  const { reason } = req.body || {};
  try {
    const r = await query('SELECT id, approved FROM users WHERE id = $1', [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Usuario no existe' });
    await query(
      `UPDATE users SET
         approved = FALSE,
         is_active = FALSE,
         approval_notes = $2,
         approved_by = $3,
         approved_at = NOW()
       WHERE id = $1`,
      [id, reason || 'Rechazado por el administrador', req.user.id]
    );
    invalidateUserCache(id);
    audit(req, 'reject_user', 'users', id, { reason });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/admin/users/:id/toggle-active
router.post('/users/:id/toggle-active', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const r = await query(
      `UPDATE users SET is_active = NOT is_active WHERE id = $1 RETURNING id, is_active`,
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Usuario no existe' });
    invalidateUserCache(req.params.id);
    audit(req, 'toggle_active_user', 'users', req.params.id, { is_active: r.rows[0].is_active });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// PATCH /api/admin/users/:id — admin puede cambiar rol o resetear contraseña
router.patch('/users/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { role, full_name, email, phone, password } = req.body || {};
    let password_hash = null;
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'Contraseña muy corta' });
      const { hash } = require('../auth');
      password_hash = await hash(password);
    }
    if (role && !['owner','tenant','admin'].includes(role)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }
    const r = await query(
      `UPDATE users SET
         role          = COALESCE($2, role),
         full_name     = COALESCE($3, full_name),
         email         = COALESCE($4, email),
         phone         = COALESCE($5, phone),
         password_hash = COALESCE($6, password_hash)
       WHERE id = $1
       RETURNING id, full_name, email, role`,
      [req.params.id, role || null, full_name || null, email || null, phone || null, password_hash]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Usuario no existe' });
    invalidateUserCache(req.params.id);
    audit(req, 'admin_update_user', 'users', req.params.id);
    res.json({ user: r.rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ese correo ya existe' });
    next(e);
  }
});

// =====================================================================
//   GESTIÓN DE USUARIOS (solo admin) — aprobaciones, dueños, inquilinos
// =====================================================================

// GET /api/admin/users?status=pending|approved|inactive|all&role=owner|tenant&q=...
router.get('/users', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { status = 'all', role, q } = req.query;
    const where = [];
    const params = [];
    if (status === 'pending')  where.push('approved IS NOT TRUE');
    if (status === 'approved') where.push('approved IS TRUE AND is_active IS TRUE');
    if (status === 'inactive') where.push('is_active IS FALSE');
    if (role) { params.push(role); where.push(`role = $${params.length}`); }
    if (q)    { params.push(`%${q}%`); where.push(`(full_name ILIKE $${params.length} OR email ILIKE $${params.length})`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const r = await query(
      `SELECT id, full_name, email, phone, role, requested_role, is_active, approved,
              approved_at, approved_by, approval_notes,
              pending_house_name, pending_currency, house_id,
              national_id, last_login, created_at
         FROM users
         ${whereSql}
         ORDER BY (approved IS NOT TRUE) DESC, created_at DESC
         LIMIT 500`,
      params
    );
    res.json({ users: r.rows });
  } catch (e) { next(e); }
});

// GET /api/admin/users/stats
router.get('/users/stats', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const r = await query(`
      SELECT
        COUNT(*) FILTER (WHERE approved IS NOT TRUE)::int AS pending,
        COUNT(*) FILTER (WHERE approved IS TRUE AND is_active IS TRUE)::int AS approved,
        COUNT(*) FILTER (WHERE is_active IS FALSE)::int AS inactive,
        COUNT(*) FILTER (WHERE role = 'owner' AND approved IS TRUE)::int AS owners,
        COUNT(*) FILTER (WHERE role = 'tenant' AND approved IS TRUE)::int AS tenants,
        COUNT(*)::int AS total
      FROM users
    `);
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// POST /api/admin/users/:id/approve
// Body opcional: { role, house_name, currency, notes }
router.post('/users/:id/approve', requireAuth, requireRole('admin'), async (req, res, next) => {
  const { id } = req.params;
  const { role: newRole, house_name, currency, notes } = req.body || {};
  try {
    const r = await query('SELECT * FROM users WHERE id = $1', [id]);
    const u = r.rows[0];
    if (!u) return res.status(404).json({ error: 'Usuario no existe' });
    if (u.approved === true) return res.status(409).json({ error: 'Esta cuenta ya está aprobada' });

    const finalRole = (newRole === 'owner' || newRole === 'tenant' || newRole === 'admin')
      ? newRole
      : (u.requested_role || u.role || 'tenant');

    let house_id = u.house_id;

    // Si será dueño y aún no tiene propiedad, créala
    if (finalRole === 'owner' && !house_id) {
      const name = house_name || u.pending_house_name || `Propiedad de ${u.full_name}`;
      const cur  = ((currency || u.pending_currency || 'COP') + '').toUpperCase();
      const h = await query(
        `INSERT INTO houses (name, currency) VALUES ($1, $2) RETURNING id`,
        [name, cur]
      );
      house_id = h.rows[0].id;
      await query(`UPDATE houses SET owner_id = $1 WHERE id = $2`, [u.id, house_id]);
    }

    await query(
      `UPDATE users SET
         approved        = TRUE,
         is_active       = TRUE,
         approved_at     = NOW(),
         approved_by     = $2,
         approval_notes  = COALESCE($3, approval_notes),
         role            = $4,
         house_id        = $5,
         pending_house_name = NULL,
         pending_currency   = NULL
       WHERE id = $1`,
      [id, req.user.id, notes || null, finalRole, house_id]
    );
    invalidateUserCache(id);
    audit(req, 'approve_user', 'users', id, { role: finalRole, house_id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/admin/users/:id/reject — rechazar registro
router.post('/users/:id/reject', requireAuth, requireRole('admin'), async (req, res, next) => {
  const { id } = req.params;
  const { reason } = req.body || {};
  try {
    const r = await query('SELECT id, approved FROM users WHERE id = $1', [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Usuario no existe' });
    await query(
      `UPDATE users SET
         approved = FALSE,
         is_active = FALSE,
         approval_notes = $2,
         approved_by = $3,
         approved_at = NOW()
       WHERE id = $1`,
      [id, reason || 'Rechazado por el administrador', req.user.id]
    );
    invalidateUserCache(id);
    audit(req, 'reject_user', 'users', id, { reason });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/admin/users/:id/toggle-active
router.post('/users/:id/toggle-active', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const r = await query(
      `UPDATE users SET is_active = NOT is_active WHERE id = $1 RETURNING id, is_active`,
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Usuario no existe' });
    invalidateUserCache(req.params.id);
    audit(req, 'toggle_active_user', 'users', req.params.id, { is_active: r.rows[0].is_active });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// PATCH /api/admin/users/:id — admin puede cambiar rol o resetear contraseña
router.patch('/users/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { role, full_name, email, phone, password } = req.body || {};
    let password_hash = null;
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'Contraseña muy corta' });
      const { hash } = require('../auth');
      password_hash = await hash(password);
    }
    if (role && !['owner','tenant','admin'].includes(role)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }
    const r = await query(
      `UPDATE users SET
         role          = COALESCE($2, role),
         full_name     = COALESCE($3, full_name),
         email         = COALESCE($4, email),
         phone         = COALESCE($5, phone),
         password_hash = COALESCE($6, password_hash)
       WHERE id = $1
       RETURNING id, full_name, email, role`,
      [req.params.id, role || null, full_name || null, email || null, phone || null, password_hash]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Usuario no existe' });
    invalidateUserCache(req.params.id);
    audit(req, 'admin_update_user', 'users', req.params.id);
    res.json({ user: r.rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ese correo ya existe' });
    next(e);
  }
});

module.exports = router;
