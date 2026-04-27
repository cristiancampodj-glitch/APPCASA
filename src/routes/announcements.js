const router = require('express').Router();
const { query } = require('../db');
const { requireAuth } = require('../middleware');
const rt = require('../services/realtime');

// Helper: notifica un anuncio en tiempo real a quienes corresponda
async function pushAnnouncement(announcement, opts = {}) {
  const { houseId, targetUserId, authorId, title, body } = opts;
  try {
    let userIds = [];
    if (targetUserId) {
      userIds = [targetUserId];
    } else if (houseId) {
      // Todos los inquilinos activos de esa casa (excepto el autor)
      const r = await query(
        `SELECT id FROM users
          WHERE house_id = $1 AND role = 'tenant'
            AND is_active = TRUE AND COALESCE(approved, TRUE) = TRUE`,
        [houseId]
      );
      userIds = r.rows.map(x => x.id).filter(id => id !== authorId);
    }
    for (const uid of userIds) {
      rt.notify(uid, {
        type: 'announcement',
        title: `📢 ${title}`,
        body: (body || '').slice(0, 140),
        link: '/#announcements'
      });
    }
    if (houseId) rt.publishToHouse(houseId, { type: 'announcement_created', announcement });
  } catch (e) {
    console.error('[announcements] pushAnnouncement error:', e.message);
  }
}


// - Inquilino: avisos de su casa, donde target sea NULL o sea él
// - Dueño: todos los avisos de las casas que posee
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const isOwner = ['owner', 'admin'].includes(req.user.role);
    const sql = isOwner
      ? `SELECT a.*, u.full_name AS author_name, h.name AS house_name,
                tu.full_name AS target_name,
                (SELECT COUNT(*) FROM announcement_likes l WHERE l.announcement_id = a.id) AS likes,
                (SELECT COUNT(*) FROM announcement_comments c WHERE c.announcement_id = a.id) AS comments,
                EXISTS(SELECT 1 FROM announcement_likes l WHERE l.announcement_id = a.id AND l.user_id = $1) AS liked
         FROM announcements a
         JOIN users u ON u.id = a.author_id
         JOIN houses h ON h.id = a.house_id
         LEFT JOIN users tu ON tu.id = a.target_user_id
         WHERE h.owner_id = $1
         ORDER BY a.pinned DESC, a.created_at DESC`
      : `SELECT a.*, u.full_name AS author_name, h.name AS house_name,
                tu.full_name AS target_name,
                (SELECT COUNT(*) FROM announcement_likes l WHERE l.announcement_id = a.id) AS likes,
                (SELECT COUNT(*) FROM announcement_comments c WHERE c.announcement_id = a.id) AS comments,
                EXISTS(SELECT 1 FROM announcement_likes l WHERE l.announcement_id = a.id AND l.user_id = $1) AS liked
         FROM announcements a
         JOIN users u ON u.id = a.author_id
         JOIN houses h ON h.id = a.house_id
         LEFT JOIN users tu ON tu.id = a.target_user_id
         WHERE a.house_id = $2
           AND (a.target_user_id IS NULL OR a.target_user_id = $1)
           AND (a.expires_at IS NULL OR a.expires_at > NOW())
           AND (a.expires_at IS NULL OR a.expires_at > NOW())
         ORDER BY a.pinned DESC, a.created_at DESC`;
    const params = isOwner ? [req.user.id] : [req.user.id, req.user.house_id];
    const r = await query(sql, params);
    res.json({ announcements: r.rows });
  } catch (e) { next(e); }
});

// POST /api/announcements
// Body:
//  - title, body, pinned
//  - scope: 'all' (todas mis propiedades) | 'house' (una propiedad) | 'user' (un inquilino)
//  - house_id (req cuando scope=house o user)
//  - target_user_id (req cuando scope=user)
router.post('/', requireAuth, async (req, res, next) => {
  try {, expires_at } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'Faltan título o cuerpo' });

    // Validar fecha de vencimiento si viene
    let exp = null;
    if (expires_at) {
      const d = new Date(expires_at);
      if (isNaN(d.getTime())) return res.status(400).json({ error: 'Fecha de vencimiento inválida' });
      if (d.getTime() < Date.now() - 60_000) return res.status(400).json({ error: 'La fecha de vencimiento ya pasó' });
      exp = d;
    }

    const isOwner = ['owner', 'admin'].includes(req.user.role);

    // Inquilino solo puede publicar en su propia casa, sin target (chat de casa)
    if (!isOwner) {
      const r = await query(
        `INSERT INTO announcements (house_id, author_id, title, body, pinned, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.user.house_id, req.user.id, title, body, !!pinned, exp
    }

    const isOwner = ['owner', 'admin'].includes(req.user.role);

    // Inquilino solo puede publicar en su propia casa, sin target (chat de casa)
    if (!isOwner) {
      const r = await query(
        `INSERT INTO announcements (house_id, author_id, title, body, pinned, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.user.house_id, req.user.id, title, body, !!pinned, exp]
      );
      pushAnnouncement(r.rows[0], { houseId: req.user.house_id, authorId: req.user.id, title, body });
      return res.status(201).json({ announcement: r.rows[0], count: 1 });
    }

    // Dueño: 3 alcances, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [h.id, req.user.id, title, body, !!pinned, exp
        `SELECT id FROM houses WHERE owner_id=$1 AND COALESCE(status,'available')<>'archived'`,
        [req.user.id]
      );
      if (!houses.rows.length) return res.status(400).json({ error: 'No tienes propiedades' });
      const inserted = [];
      for (const h of houses.rows) {
        const r = await query(
          `INSERT INTO announcements (house_id, author_id, title, body, pinned, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [h.id, req.user.id, title, body, !!pinned, exp]
        );
        inserted.push(r.rows[0]);
        pushAnnouncement(r.rows[0], { houseId: h.id, authorId: req.user.id, title, body });
      }
      return res.status(201).json({ announcement: inserted[0], count: inserted.length });
    }

    if (scope === 'user') {
      if (!target_user_id) return res.status(400).json({ error: 'Falta destinatario' });, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [u.rows[0].house_id, req.user.id, title, body, !!pinned, target_user_id, exp
         JOIN houses h ON h.id = u.house_id
         WHERE u.id = $1`, [target_user_id]
      );
      if (!u.rows[0] || u.rows[0].owner_id !== req.user.id) {
        return res.status(403).json({ error: 'Inquilino no encontrado en tus propiedades' });
      }
      const r = await query(
        `INSERT INTO announcements (house_id, author_id, title, body, pinned, target_user_id, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [u.rows[0].house_id, req.user.id, title, body, !!pinned, target_user_id, exp]
      );
      pushAnnouncement(r.rows[0], { targetUserId: target_user_id, authorId, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [targetHouse, req.user.id, title, body, !!pinned, exp

    // scope === 'house' (default)
    const targetHouse = house_id;
    if (!targetHouse) return res.status(400).json({ error: 'Falta propiedad' });
    const own = await query(`SELECT 1 FROM houses WHERE id=$1 AND owner_id=$2`, [targetHouse, req.user.id]);
    if (!own.rows[0]) return res.status(403).json({ error: 'Propiedad no autorizada' });
    const r = await query(
      `INSERT INTO announcements (house_id, author_id, title, body, pinned, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [targetHouse, req.user.id, title, body, !!pinned, exp]
    );
    pushAnnouncement(r.rows[0], { houseId: targetHouse, authorId: req.user.id, title, body });
    res.status(201).json({ announcement: r.rows[0], count: 1 });
  } catch (e) { next(e); }
});

// DELETE — solo el autor o el dueño de la casa
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const r = await query(
      `DELETE FROM announcements a
       USING houses h
       WHERE a.id = $1 AND a.house_id = h.id
         AND (a.author_id = $2 OR h.owner_id = $2)
       RETURNING a.id`,
      [req.params.id, req.user.id]
    );
    if (!r.rows[0]) return res.status(403).json({ error: 'No autorizado' });
    res.json({ ok: true });
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
