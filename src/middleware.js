const { verify } = require('./auth');
const { query } = require('./db');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = verify(token);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido' });
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

module.exports = { requireAuth, requireRole, audit };
