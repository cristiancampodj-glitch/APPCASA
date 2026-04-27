const router = require('express').Router();
const { query } = require('../db');
const { requireAuth, audit } = require('../middleware');
const rt = require('../services/realtime');

router.get('/', requireAuth, async (req, res, next) => {
  try {
    // Filtro por rol:
    //  - admin: ve todos los daños
    //  - owner: ve los daños de TODAS las casas que administra (houses.owner_id = user.id)
    //           + los de su propia house_id (compatibilidad).
    //  - tenant: solo los de su house_id.
    let where, params;
    if (req.user.role === 'admin') {
      where = 'TRUE';
      params = [];
    } else if (req.user.role === 'owner') {
      where = '(h.owner_id = $1 OR d.house_id = $2)';
      params = [req.user.id, req.user.house_id];
    } else {
      where = 'd.house_id = $1';
      params = [req.user.house_id];
    }
    const r = await query(
      `SELECT d.*,
              u.full_name AS reporter_name,
              h.name      AS house_name,
              h.unit_label AS house_unit,
              (SELECT json_agg(p.*) FROM damage_photos p WHERE p.damage_id = d.id) AS photos
         FROM damages d
         JOIN users  u ON u.id = d.reported_by
         JOIN houses h ON h.id = d.house_id
        WHERE ${where}
        ORDER BY d.created_at DESC`,
      params
    );
    res.json({ damages: r.rows });
  } catch (e) { next(e); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { title, description, location, priority, estimated_cost, photos = [], photo_url } = req.body;
    const r = await query(
      `INSERT INTO damages (house_id, reported_by, title, description, location, priority, estimated_cost, photo_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.house_id, req.user.id, title, description, location, priority || 'medium', estimated_cost, photo_url || null]
    );
    for (const url of photos) {
      await query(`INSERT INTO damage_photos (damage_id, url, uploaded_by) VALUES ($1,$2,$3)`,
        [r.rows[0].id, url, req.user.id]);
    }
    audit(req, 'create_damage', 'damages', r.rows[0].id);

    // 🔔 Notificar en tiempo real al dueño de la propiedad
    const damage = r.rows[0];
    const own = await query('SELECT owner_id, name, unit_label FROM houses WHERE id = $1', [damage.house_id]);
    const ownerId = own.rows[0] && own.rows[0].owner_id;
    const houseLabel = own.rows[0] ? (own.rows[0].unit_label || own.rows[0].name) : '';
    if (ownerId) {
      rt.notify(ownerId, {
        type: 'damage',
        title: `🛠️ Nuevo daño reportado en ${houseLabel}`,
        body: `${req.user.full_name || 'El inquilino'}: ${damage.title}`,
        link: '/#damages'
      });
    }
    rt.publishToHouse(damage.house_id, { type: 'damage_created', damage });

    res.status(201).json({ damage });
  } catch (e) { next(e); }
});

router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const { status, final_cost } = req.body;
    // Verificar permiso: el usuario debe ser admin, dueño de la casa del daño,
    // o el inquilino que lo reportó (para cancelar).
    const owner = await query(
      `SELECT d.id, d.reported_by, d.house_id, h.owner_id
         FROM damages d JOIN houses h ON h.id = d.house_id
        WHERE d.id = $1`, [req.params.id]);
    const row = owner.rows[0];
    if (!row) return res.status(404).json({ error: 'Daño no encontrado' });
    const isAdmin   = req.user.role === 'admin';
    const isOwner   = row.owner_id === req.user.id;
    const isReporter= row.reported_by === req.user.id;
    if (!isAdmin && !isOwner && !isReporter) {
      return res.status(403).json({ error: 'No tienes permiso para modificar este daño' });
    }
    const r = await query(
      `UPDATE damages SET
         status = COALESCE($2, status),
         final_cost = COALESCE($3, final_cost),
         resolved_at = CASE WHEN $2 = 'resolved' THEN NOW() ELSE resolved_at END,
         resolved_by = CASE WHEN $2 = 'resolved' THEN $4 ELSE resolved_by END
       WHERE id = $1 RETURNING *`,
      [req.params.id, status, final_cost, req.user.id]
    );
    audit(req, 'update_damage', 'damages', req.params.id, { status });

    // 🔔 Notificar al inquilino que reportó cuando el dueño cambia el estado
    if (status && row.reported_by && row.reported_by !== req.user.id) {
      rt.notify(row.reported_by, {
        type: 'damage',
        title: status === 'resolved' ? '✅ Tu daño fue marcado como resuelto'
             : status === 'in_progress' ? '🔧 Tu daño ya está en proceso'
             : `Estado de tu daño: ${status}`,
        body: r.rows[0].title,
        link: '/#damages'
      });
    }
    rt.publishToHouse(row.house_id, { type: 'damage_updated', damage: r.rows[0] });

    res.json({ damage: r.rows[0] });
  } catch (e) { next(e); }
});

module.exports = router;
