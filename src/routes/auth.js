const router = require('express').Router();
const { query } = require('../db');
const { hash, compare, sign } = require('../auth');
const { requireAuth, audit } = require('../middleware');

// POST /api/auth/register — toda cuenta nueva queda PENDIENTE de aprobación
router.post('/register', async (req, res, next) => {
  try {
    const { full_name, email, password, phone, house_name, currency, requested_role } = req.body;
    if (!full_name || !email || !password) return res.status(400).json({ error: 'Datos incompletos' });
    if (password.length < 6) return res.status(400).json({ error: 'Contraseña muy corta' });

    const exists = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows[0]) return res.status(409).json({ error: 'Email ya registrado' });

    const role = (requested_role === 'owner' || house_name) ? 'owner' : 'tenant';
    const password_hash = await hash(password);

    // Cuenta inactiva y NO aprobada hasta que un admin la valide.
    // No se crea la casa todavía: si pide ser dueño, guardamos el nombre y moneda
    // en pending_house_name/pending_currency para crear la casa al aprobar.
    const u = await query(
      `INSERT INTO users (
         full_name, email, phone, password_hash, role,
         is_active, approved, requested_role,
         pending_house_name, pending_currency
       )
       VALUES ($1,$2,$3,$4,$5, FALSE, FALSE, $5, $6, $7)
       RETURNING id, full_name, email, role`,
      [full_name, email, phone || null, password_hash, role,
       house_name || null, ((currency || 'COP') + '').toUpperCase()]
    );
    audit(req, 'register_request', 'users', u.rows[0].id, { role });
    res.status(202).json({
      pending: true,
      message: 'Tu solicitud fue recibida. Un administrador la revisará y te avisaremos cuando esté aprobada.',
      user: u.rows[0]
    });
  } catch (e) { next(e); }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const r = await query('SELECT * FROM users WHERE email = $1', [email]);
    const u = r.rows[0];
    if (!u) return res.status(401).json({ error: 'Credenciales inválidas' });
    const ok = await compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

    if (u.approved !== true) {
      return res.status(403).json({ error: 'Tu cuenta aún no ha sido aprobada por un administrador.' });
    }
    if (u.is_active === false) {
      return res.status(403).json({ error: 'Tu cuenta está desactivada. Contacta al administrador.' });
    }

    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [u.id]);
    const token = sign({ id: u.id, role: u.role, house_id: u.house_id, email: u.email });
    res.json({
      user: { id: u.id, full_name: u.full_name, email: u.email, role: u.role, house_id: u.house_id, theme: u.theme, locale: u.locale },
      token
    });
  } catch (e) { next(e); }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT id, full_name, email, phone, role, house_id, avatar_url, theme, locale, totp_enabled
       FROM users WHERE id = $1`, [req.user.id]
    );
    res.json({ user: r.rows[0] });
  } catch (e) { next(e); }
});

// POST /api/auth/accept-terms
router.post('/accept-terms', requireAuth, async (req, res, next) => {
  try {
    const { document, version } = req.body;
    await query(
      `INSERT INTO terms_acceptances (user_id, document, version, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5)`,
      [req.user.id, document, version, req.ip, req.headers['user-agent']]
    );
    audit(req, 'accept_terms', 'terms', null, { document, version });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/auth/refresh — renueva el JWT si la sesión sigue válida
router.post('/refresh', requireAuth, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT id, role, house_id, email FROM users WHERE id = $1 AND is_active = TRUE`,
      [req.user.id]
    );
    const u = r.rows[0];
    if (!u) return res.status(401).json({ error: 'Sesión inválida' });
    const token = sign({ id: u.id, role: u.role, house_id: u.house_id, email: u.email });
    res.json({ token });
  } catch (e) { next(e); }
});

module.exports = router;
