const router = require('express').Router();
const { query } = require('../db');
const { requireAuth, requireRole, audit } = require('../middleware');
const { hash } = require('../auth');

// GET /api/houses — todas las del dueño con resumen (ocupante, mora, daños)
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const isOwner = ['owner', 'admin'].includes(req.user.role);
    const where = isOwner ? `(h.owner_id = $1 OR h.id = $2)` : `h.id = $2`;
    const params = [req.user.id, req.user.house_id];

    const r = await query(`
      SELECT
        h.*,
        (SELECT json_agg(json_build_object('id', u.id, 'name', u.full_name, 'email', u.email, 'phone', u.phone))
           FROM users u WHERE u.house_id = h.id AND u.role='tenant' AND u.is_active=TRUE) AS tenants,
        (SELECT COUNT(*)::int FROM payments p
           WHERE p.house_id = h.id AND p.status IN ('overdue','pending') AND p.due_date < CURRENT_DATE) AS overdue_count,
        (SELECT COALESCE(SUM(amount - COALESCE(amount_paid,0)),0)::float FROM payments p
           WHERE p.house_id = h.id AND p.status IN ('overdue','pending') AND p.due_date < CURRENT_DATE) AS overdue_amount,
        (SELECT COUNT(*)::int FROM damages d
           WHERE d.house_id = h.id AND d.status IN ('reported','in_progress')) AS damages_count,
        (SELECT COUNT(*)::int FROM chores c
           WHERE c.house_id = h.id AND c.status='pending') AS chores_count,
        (SELECT COALESCE(SUM(amount_paid),0)::float FROM payments p
           WHERE p.house_id = h.id AND p.status='paid'
             AND p.paid_at >= date_trunc('month', NOW())) AS income_month
      FROM houses h
      WHERE ${where} AND COALESCE(h.status,'available') <> 'archived'
      ORDER BY h.created_at ASC
    `, params);

    res.json({ houses: r.rows });
  } catch (e) { next(e); }
});

// GET /api/houses/mine
router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const r = await query('SELECT * FROM houses WHERE id = $1', [req.user.house_id]);
    res.json({ house: r.rows[0] || null });
  } catch (e) { next(e); }
});

// POST /api/houses — agregar nuevo apartamento
router.post('/', requireAuth, requireRole('owner','admin'), async (req, res, next) => {
  try {
    const f = req.body;
    if (!f.name) return res.status(400).json({ error: 'Falta el nombre del inmueble' });
    const r = await query(
      `INSERT INTO houses (name, address, city, country, monthly_rent, currency, unit_label, photo_url, bank_info, owner_whatsapp, owner_id, status)
       VALUES ($1,$2,$3,COALESCE($4,'CO'),$5,COALESCE($6,'COP'),$7,$8,$9,$10,$11,'available') RETURNING *`,
      [f.name, f.address || null, f.city || null, f.country, f.monthly_rent || 0,
       (f.currency || '').toUpperCase() || null, f.unit_label || null, f.photo_url || null,
       f.bank_info || null, f.owner_whatsapp || null, req.user.id]
    );
    audit(req, 'create_house', 'houses', r.rows[0].id);
    res.status(201).json({ house: r.rows[0] });
  } catch (e) { next(e); }
});

// PATCH /api/houses/:id
router.patch('/:id', requireAuth, requireRole('owner','admin'), async (req, res, next) => {
  try {
    const f = req.body;
    const day = (v) => {
      if (v === undefined || v === null || v === '') return null;
      const n = parseInt(v, 10);
      return (n >= 1 && n <= 31) ? n : null;
    };
    const r = await query(
      `UPDATE houses SET
        name           = COALESCE($2, name),
        address        = COALESCE($3, address),
        city           = COALESCE($4, city),
        country        = COALESCE($5, country),
        monthly_rent   = COALESCE($6, monthly_rent),
        currency       = COALESCE($7, currency),
        rules          = COALESCE($8, rules),
        unit_label     = COALESCE($9, unit_label),
        photo_url      = COALESCE($10, photo_url),
        status         = COALESCE($11, status),
        bank_info      = COALESCE($12, bank_info),
        owner_whatsapp = COALESCE($13, owner_whatsapp),
        rent_due_day      = COALESCE($14, rent_due_day),
        water_due_day     = COALESCE($15, water_due_day),
        power_due_day     = COALESCE($16, power_due_day),
        gas_due_day       = COALESCE($17, gas_due_day),
        internet_due_day  = COALESCE($18, internet_due_day),
        services_notes    = COALESCE($19, services_notes)
       WHERE id = $1 RETURNING *`,
      [req.params.id, f.name, f.address, f.city, f.country, f.monthly_rent,
       f.currency, f.rules, f.unit_label, f.photo_url, f.status,
       f.bank_info, f.owner_whatsapp,
       day(f.rent_due_day), day(f.water_due_day), day(f.power_due_day),
       day(f.gas_due_day), day(f.internet_due_day), f.services_notes || null]
    );
    audit(req, 'update_house', 'houses', req.params.id);
    res.json({ house: r.rows[0] });
  } catch (e) { next(e); }
});

// DELETE /api/houses/:id (archivar)
router.delete('/:id', requireAuth, requireRole('owner','admin'), async (req, res, next) => {
  try {
    await query(`UPDATE houses SET status='archived' WHERE id=$1 AND owner_id=$2`,
      [req.params.id, req.user.id]);
    audit(req, 'archive_house', 'houses', req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/houses/:id/invite-tenant — añadir inquilino al apartamento
router.post('/:id/invite-tenant', requireAuth, requireRole('owner','admin'), async (req, res, next) => {
  try {
    const { full_name, email, phone, password } = req.body;
    if (!full_name || !email || !password)
      return res.status(400).json({ error: 'Falta nombre, email o contraseña' });

    const own = await query(
      `SELECT id FROM houses WHERE id=$1 AND (owner_id=$2 OR $3='admin')`,
      [req.params.id, req.user.id, req.user.role]
    );
    if (!own.rows[0]) return res.status(403).json({ error: 'No es tu inmueble' });

    const exists = await query('SELECT id FROM users WHERE email=$1', [email]);
    if (exists.rows[0]) return res.status(409).json({ error: 'Ese email ya tiene cuenta' });

    const password_hash = await hash(password);
    const u = await query(
      `INSERT INTO users (house_id, full_name, email, phone, password_hash, role)
       VALUES ($1,$2,$3,$4,$5,'tenant') RETURNING id, full_name, email, role, house_id`,
      [req.params.id, full_name, email, phone || null, password_hash]
    );
    await query(`UPDATE houses SET status='occupied' WHERE id=$1`, [req.params.id]);
    audit(req, 'invite_tenant', 'users', u.rows[0].id);
    res.status(201).json({ user: u.rows[0], login: { email, password } });
  } catch (e) { next(e); }
});

module.exports = router;
