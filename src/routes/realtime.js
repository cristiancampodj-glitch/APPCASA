/**
 * GET /api/realtime/stream?token=JWT
 *   Server-Sent Events. EventSource no permite cabeceras, así que el token
 *   viaja por query string (HTTPS lo cifra de igual forma que el header).
 */
const router = require('express').Router();
const { verify } = require('../auth');
const { subscribe } = require('../services/realtime');
const { query } = require('../db');

router.get('/stream', async (req, res, next) => {
  try {
    const token = req.query.token;
    if (!token) return res.status(401).end();
    let decoded;
    try { decoded = verify(token); } catch { return res.status(401).end(); }
    const userId = decoded.sub || decoded.id;
    if (!userId) return res.status(401).end();

    // Verificar que la cuenta sigue activa
    const r = await query('SELECT is_active, approved FROM users WHERE id = $1', [userId]);
    const u = r.rows[0];
    if (!u || u.is_active === false || u.approved === false) {
      return res.status(403).end();
    }

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.flushHeaders && res.flushHeaders();
    res.write('retry: 2000\n\n');
    res.write(`data: ${JSON.stringify({ type:'hello', ts: Date.now() })}\n\n`);

    subscribe(userId, res);

    // Heartbeat para que proxies no cierren la conexión (cada 15s)
    const ping = setInterval(() => {
      try { res.write(': ping\n\n'); } catch {}
    }, 15000);
    req.on('close', () => clearInterval(ping));
  } catch (e) { next(e); }
});

module.exports = router;
