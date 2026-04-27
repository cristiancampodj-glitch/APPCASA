const { verify } = require('./auth');
const { query } = require('./db');

// Cache muy corto para evitar 1 query extra por request
const userCache = new Map(); // id -> { user, exp }
const USER_CACHE_TTL_MS = 30 * 1000;

async function loadFreshUser(id) {
  const cached = userCache.get(id);
  if (cached && cached.exp > Date.now()) return cached.user;
  const r = await query(
    `SELECT id, role, house_id, email, is_active FROM users WHERE id = $1`,
    [id]
  );
  const user = r.rows[0];
  userCache.set(id, { user, exp: Date.now() + USER_CACHE_TTL_MS });
  return user;
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });

  let payload;
  try {
    payload = verify(token);
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  try {
    const fresh = await loadFreshUser(payload.id);
    if (!fresh) return res.status(401).json({ error: 'Usuario no existe' });
    if (fresh.is_active === false) return res.status(403).json({ error: 'Cuenta desactivada' });

    // Mezcla payload del JWT con datos frescos de DB (rol/house_id pueden haber cambiado)
    req.user = {
      id: fresh.id,
      role: fresh.role,
      house_id: fresh.house_id,
      email: fresh.email
    };
    next();
  } catch (e) {
    next(e);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Sin permisos' });
    next();
  };
}

async function audit(req, action, entity, entity_id, metadata = {}) {
  try {
    await query(
      `INSERT INTO audit_log (user_id, house_id, action, entity, entity_id, metadata, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        req.user?.id || null,
        req.user?.house_id || null,
        action, entity, entity_id || null,
        metadata,
        (req.ip || '').split(',')[0].trim() || null
      ]
    );
  } catch (e) { /* no rompemos por audit */ }
}

function invalidateUserCache(id) { userCache.delete(id); }

module.exports = { requireAuth, requireRole, audit, invalidateUserCache };
