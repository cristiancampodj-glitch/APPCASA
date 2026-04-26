const router = require('express').Router();
const { query } = require('../db');
const { hash, compare, sign } = require('../auth');
const { requireAuth, audit } = require('../middleware');

// POST /api/auth/register — solo el primer dueño se auto-registra
router.post('/register', async (req, res, next) => {
  try {
    const { full_name, email, password, phone, house_name } = req.body;
    if (!full_name || !email || !password) return res.status(400).json({ error: 'Datos incompletos' });
    if (password.length < 6) return res.status(400).json({ error: 'Contraseña muy corta' });

    const exists = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows[0]) return res.status(409).json({ error: 'Email ya registrado' });

    // Crea casa si manda house_name
    let house_id = null;
    if (house_name) {
      const h = await query(
        `INSERT INTO houses (name) VALUES ($1) RETURNING id`,
        [house_name]
      );
      house_id = h.rows[0].id;
    }

    const password_hash = await hash(password);
    const role = house_id ? 'owner' : 'tenant';
    const u = await query(
      `INSERT INTO users (house_id, full_name, email, phone, password_hash, role)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, full_name, email, role, house_id`,
      [house_id, full_name, email, phone || null, password_hash, role]
    );
    const user = u.rows[0];
    const token = sign({ id: user.id, role: user.role, house_id: user.house_id, email: user.email });
    res.json({ user, token });
  } catch (e) { next(e); }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const r = await query('SELECT * FROM users WHERE email = $1 AND is_active = TRUE', [email]);
    const u = r.rows[0];
    if (!u) return res.status(401).json({ error: 'Credenciales inválidas' });
    const ok = await compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

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

module.exports = router;
