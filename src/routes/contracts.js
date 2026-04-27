const router = require('express').Router();
const { query } = require('../db');
const { requireAuth, requireRole, audit } = require('../middleware');
const { generateContract } = require('../services/pdf');

// GET /api/contracts — owner: todos los suyos; tenant: el suyo
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const where = [];
    const params = [];
    if (req.user.role === 'tenant') {
      params.push(req.user.id);
      where.push(`c.tenant_id = $${params.length}`);
    } else if (req.user.role === 'owner') {
      params.push(req.user.id);
      params.push(req.user.house_id);
      where.push(`(EXISTS (SELECT 1 FROM houses h WHERE h.id = c.house_id AND h.owner_id = $${params.length - 1}) OR c.house_id = $${params.length})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const r = await query(
      `SELECT c.*,
              h.name AS house_name,
              u.full_name AS tenant_name
       FROM contracts c
       JOIN houses h ON h.id = c.house_id
       JOIN users  u ON u.id = c.tenant_id
       ${whereSql}
       ORDER BY c.created_at DESC`,
      params
    );
    res.json({ contracts: r.rows });
  } catch (e) { next(e); }
});

// GET /api/contracts/:id
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT c.*, h.name AS house_name, u.full_name AS tenant_name
       FROM contracts c
       JOIN houses h ON h.id = c.house_id
       JOIN users  u ON u.id = c.tenant_id
       WHERE c.id = $1`,
      [req.params.id]
    );
    const c = r.rows[0];
    if (!c) return res.status(404).json({ error: 'Contrato no encontrado' });
    if (req.user.role === 'tenant' && c.tenant_id !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    res.json({ contract: c });
  } catch (e) { next(e); }
});

// POST /api/contracts — owner crea contrato
router.post('/', requireAuth, requireRole('owner','admin'), async (req, res, next) => {
  try {
    const {
      house_id, tenant_id, start_date, end_date,
      monthly_rent, deposit, payment_day, body_text, notes
    } = req.body;

    if (!house_id || !tenant_id || !start_date || !monthly_rent) {
      return res.status(400).json({ error: 'Faltan datos: house_id, tenant_id, start_date, monthly_rent' });
    }

    // Validar permiso del owner sobre la casa
    if (req.user.role !== 'admin') {
      const h = await query('SELECT owner_id FROM houses WHERE id = $1', [house_id]);
      if (!h.rows[0] || (h.rows[0].owner_id && h.rows[0].owner_id !== req.user.id)) {
        return res.status(403).json({ error: 'No tienes permiso sobre esta casa' });
      }
    }

    const r = await query(
      `INSERT INTO contracts
        (house_id, tenant_id, start_date, end_date, monthly_rent, deposit, payment_day, body_text, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active')
       RETURNING *`,
      [house_id, tenant_id, start_date, end_date || null, monthly_rent,
       deposit || 0, payment_day || 5, body_text || null, notes || null]
    );
    audit(req, 'create_contract', 'contracts', r.rows[0].id);
    res.status(201).json({ contract: r.rows[0] });
  } catch (e) { next(e); }
});

// PATCH /api/contracts/:id — actualizar cuerpo / datos
router.patch('/:id', requireAuth, requireRole('owner','admin'), async (req, res, next) => {
  try {
    const { body_text, notes, end_date, monthly_rent, deposit, payment_day, status } = req.body;
    // Verificar acceso
    const cur = await query(
      `SELECT c.*, h.owner_id FROM contracts c JOIN houses h ON h.id = c.house_id WHERE c.id = $1`,
      [req.params.id]
    );
    const c = cur.rows[0];
    if (!c) return res.status(404).json({ error: 'No existe' });
    if (req.user.role !== 'admin' && c.owner_id && c.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const r = await query(
      `UPDATE contracts SET
         body_text    = COALESCE($2, body_text),
         notes        = COALESCE($3, notes),
         end_date     = COALESCE($4, end_date),
         monthly_rent = COALESCE($5, monthly_rent),
         deposit      = COALESCE($6, deposit),
         payment_day  = COALESCE($7, payment_day),
         status       = COALESCE($8, status)
       WHERE id = $1
       RETURNING *`,
      [req.params.id, body_text, notes, end_date, monthly_rent, deposit, payment_day, status]
    );
    audit(req, 'update_contract', 'contracts', r.rows[0].id);
    res.json({ contract: r.rows[0] });
  } catch (e) { next(e); }
});

// POST /api/contracts/:id/sign — body { signature: dataURL }
router.post('/:id/sign', requireAuth, async (req, res, next) => {
  try {
    const { signature } = req.body;
    if (!signature || typeof signature !== 'string' || signature.length < 100) {
      return res.status(400).json({ error: 'Firma inválida' });
    }
    // Limitar tamaño (~2MB) para evitar abuso
    if (signature.length > 2_500_000) {
      return res.status(413).json({ error: 'Firma demasiado grande' });
    }

    const cur = await query(
      `SELECT c.*, h.owner_id FROM contracts c JOIN houses h ON h.id = c.house_id WHERE c.id = $1`,
      [req.params.id]
    );
    const c = cur.rows[0];
    if (!c) return res.status(404).json({ error: 'No existe' });

    let role = null;
    if (req.user.role === 'tenant' && c.tenant_id === req.user.id) role = 'tenant';
    else if (req.user.role === 'admin') role = 'admin';
    else if (req.user.role === 'owner' && (c.owner_id === req.user.id || !c.owner_id)) role = 'owner';

    if (!role) return res.status(403).json({ error: 'No autorizado para firmar' });

    let sql, params;
    if (role === 'tenant') {
      sql = `UPDATE contracts SET signature_tenant = $2, signed_tenant_at = NOW() WHERE id = $1 RETURNING *`;
    } else {
      sql = `UPDATE contracts SET signature_owner = $2, signed_owner_at = NOW() WHERE id = $1 RETURNING *`;
    }
    params = [req.params.id, signature];

    const r = await query(sql, params);
    audit(req, 'sign_contract', 'contracts', r.rows[0].id);
    res.json({ contract: r.rows[0] });
  } catch (e) { next(e); }
});

// GET /api/contracts/:id/pdf — descarga PDF del contrato
router.get('/:id/pdf', requireAuth, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT c.*,
              h.name AS house_name, h.address, h.currency,
              t.full_name AS tenant_name, t.email AS tenant_email,
              o.full_name AS owner_name
         FROM contracts c
         JOIN houses h ON h.id = c.house_id
         JOIN users  t ON t.id = c.tenant_id
         LEFT JOIN users o ON o.id = h.owner_id
        WHERE c.id = $1`,
      [req.params.id]
    );
    const c = r.rows[0];
    if (!c) return res.status(404).json({ error: 'Contrato no encontrado' });
    if (req.user.role === 'tenant' && c.tenant_id !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="contrato-${c.id}.pdf"`);
    await generateContract(res, c);
  } catch (e) { next(e); }
});

// DELETE /api/contracts/:id
router.delete('/:id', requireAuth, requireRole('owner','admin'), async (req, res, next) => {
  try {
    const cur = await query(
      `SELECT c.*, h.owner_id FROM contracts c JOIN houses h ON h.id = c.house_id WHERE c.id = $1`,
      [req.params.id]
    );
    const c = cur.rows[0];
    if (!c) return res.status(404).json({ error: 'No existe' });
    if (req.user.role !== 'admin' && c.owner_id && c.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    await query('DELETE FROM contracts WHERE id = $1', [req.params.id]);
    audit(req, 'delete_contract', 'contracts', req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
